import { findEvolutionMessages } from "@/lib/evolution/client";
import { processEvolutionEvent } from "@/features/whatsapp/ingest";
import { getServerEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function recentRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["records", "messages", "data"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
    const nested = recentRecords(candidate);
    if (nested.length) return nested;
  }
  return [];
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.CRON_SECRET || supplied !== env.CRON_SECRET) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const client = createServiceRoleClient();
  const { data: connections, error } = await client
    .from("whatsapp_connections")
    .select("*")
    .limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let imported = 0;
  let failures = 0;
  for (let offset = 0; offset < (connections?.length ?? 0); offset += 5) {
    const batch = connections!.slice(offset, offset + 5);
    await Promise.all(batch.map(async (connection) => {
      // Sem remoteJid: traz a janela recente da instância inteira e também
      // recupera conversas novas cujo webhook tenha se perdido.
      const result = await findEvolutionMessages(connection.instance_name, undefined, 100);
      if (!result.ok) {
        failures += 1;
        await client.from("whatsapp_connections").update({ last_error: result.error }).eq("id", connection.id);
        return;
      }
      for (const item of recentRecords(result.data)) {
        try {
          const status = await processEvolutionEvent(client, connection, "MESSAGES_UPSERT", { data: item });
          if (status === "processed") imported += 1;
        } catch {
          failures += 1;
        }
      }
      await client.from("whatsapp_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
    }));
  }

  return Response.json({ ok: failures === 0, connections: connections?.length ?? 0, imported, failures });
}
