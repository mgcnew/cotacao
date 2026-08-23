import { createHash, timingSafeEqual } from "node:crypto";

import { processEvolutionEvent } from "@/features/whatsapp/ingest";
import { getServerEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.EVOLUTION_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const supplied =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secureEqual(supplied, env.EVOLUTION_WEBHOOK_SECRET)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 2_000_000) {
    return Response.json({ error: "Evento muito grande." }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const instanceValue = payload.instance;
  const instance = typeof instanceValue === "string"
    ? instanceValue
    : instanceValue && typeof instanceValue === "object"
      ? String((instanceValue as Record<string, unknown>).instanceName ?? "")
      : "";
  const eventType = String(payload.event ?? payload.type ?? "unknown");
  if (!instance) {
    return Response.json({ error: "Instância ausente." }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const { data: connection, error: connectionError } = await client
    .from("whatsapp_connections")
    .select("*")
    .eq("instance_name", instance)
    .maybeSingle();
  if (connectionError) {
    return Response.json({ error: connectionError.message }, { status: 500 });
  }
  if (!connection) {
    return Response.json({ error: "Instância não associada a uma empresa." }, { status: 404 });
  }

  const eventKey = createHash("sha256").update(rawBody).digest("hex");
  const { data: event, error: eventError } = await client
    .from("whatsapp_webhook_events")
    .insert({
      company_id: connection.company_id,
      connection_id: connection.id,
      provider_event_key: eventKey,
      event_type: eventType,
      payload: payload as Json,
    })
    .select("id")
    .single();

  if (eventError?.code === "23505") {
    return Response.json({ ok: true, duplicate: true });
  }
  if (eventError || !event) {
    return Response.json({ error: eventError?.message ?? "Falha ao registrar evento." }, { status: 500 });
  }

  try {
    const status = await processEvolutionEvent(client, connection, eventType, payload);
    await client
      .from("whatsapp_webhook_events")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("id", event.id);
    if (eventType.replace(/[.\s-]+/g, "_").toUpperCase() !== "CONNECTION_UPDATE") {
      await client
        .from("whatsapp_connections")
        .update({ last_event_at: new Date().toISOString() })
        .eq("id", connection.id);
    }
    return Response.json({ ok: true, status });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha ao processar webhook.";
    await client
      .from("whatsapp_webhook_events")
      .update({ status: "failed", error_message: message.slice(0, 500) })
      .eq("id", event.id);
    return Response.json({ error: "Evento registrado para nova tentativa." }, { status: 500 });
  }
}
