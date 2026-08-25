import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { processEvolutionEvent } from "@/features/whatsapp/ingest";
import { findEvolutionMessages, getEvolutionConnectionState } from "@/lib/evolution/client";
import type { Database } from "@/types/database";

type ServiceClient = SupabaseClient<Database>;
type Connection = Database["public"]["Tables"]["whatsapp_connections"]["Row"];

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

export type WhatsAppReconcileResult = {
  ok: boolean;
  checked: number;
  failures: number;
  error: string | null;
};

export async function reconcileWhatsAppConnection(
  client: ServiceClient,
  connection: Connection,
): Promise<WhatsAppReconcileResult> {
  const checkedAt = new Date().toISOString();
  const state = await getEvolutionConnectionState(connection.instance_name);
  if (!state.ok) {
    await client.from("whatsapp_connections").update({
      status: "error",
      last_error: state.error,
      last_sync_at: checkedAt,
    }).eq("id", connection.id);
    return { ok: false, checked: 0, failures: 1, error: state.error };
  }

  await client.from("whatsapp_connections").update({
    status: state.state,
    phone_number: state.phone ?? connection.phone_number,
    last_connected_at:
      state.state === "connected" && connection.status !== "connected"
        ? checkedAt
        : connection.last_connected_at,
    last_error: null,
  }).eq("id", connection.id);

  if (state.state !== "connected") {
    await client.from("whatsapp_connections").update({ last_sync_at: checkedAt }).eq("id", connection.id);
    return { ok: true, checked: 0, failures: 0, error: null };
  }

  const result = await findEvolutionMessages(connection.instance_name, undefined, 100);
  if (!result.ok) {
    await client.from("whatsapp_connections").update({
      last_sync_at: checkedAt,
      last_error: result.error,
    }).eq("id", connection.id);
    return { ok: false, checked: 0, failures: 1, error: result.error };
  }

  const records = recentRecords(result.data);
  let failures = 0;
  for (const item of records) {
    try {
      await processEvolutionEvent(client, connection, "MESSAGES_UPSERT", { data: item });
    } catch {
      failures += 1;
    }
  }
  const error = failures > 0
    ? `${failures} mensagem(ns) não puderam ser sincronizadas.`
    : null;
  await client.from("whatsapp_connections").update({
    last_sync_at: new Date().toISOString(),
    last_error: error,
  }).eq("id", connection.id);
  return {
    ok: failures === 0,
    checked: records.length,
    failures,
    error,
  };
}
