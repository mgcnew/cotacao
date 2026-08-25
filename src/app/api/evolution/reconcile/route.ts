import { reconcileWhatsAppConnection } from "@/features/whatsapp/reconcile";
import { getServerEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let failures = 0;
  for (let offset = 0; offset < (connections?.length ?? 0); offset += 5) {
    const batch = connections!.slice(offset, offset + 5);
    await Promise.all(batch.map(async (connection) => {
      const result = await reconcileWhatsAppConnection(client, connection);
      checked += result.checked;
      failures += result.failures;
    }));
  }

  return Response.json({ ok: failures === 0, connections: connections?.length ?? 0, checked, failures });
}
