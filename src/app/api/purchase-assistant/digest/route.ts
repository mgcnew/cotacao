import { listPurchaseSuggestionsWithClient } from "@/features/shopping-list/suggestions";
import { listPurchaseScheduleAlertsWithClient } from "@/features/suppliers/schedules";
import { getServerEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const env = getServerEnv();
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.CRON_SECRET || supplied !== env.CRON_SECRET) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const client = createServiceRoleClient();
  const { data: companies, error } = await client
    .from("companies")
    .select("id")
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let companiesChecked = 0;
  let notificationsCreated = 0;
  const failures: string[] = [];

  for (let offset = 0; offset < (companies?.length ?? 0); offset += 3) {
    const batch = companies!.slice(offset, offset + 3);
    await Promise.all(
      batch.map(async ({ id: companyId }) => {
        try {
          const [scheduleAlerts, suggestions] = await Promise.all([
            listPurchaseScheduleAlertsWithClient(companyId, client),
            listPurchaseSuggestionsWithClient(companyId, client),
          ]);
          const { data: created, error: digestError } = await client.rpc(
            "rpc_service_create_purchase_assistant_digest",
            {
              p_company_id: companyId,
              p_schedule_count: scheduleAlerts.length,
              p_overdue_schedule_count: scheduleAlerts.filter(
                (alert) => alert.status === "overdue",
              ).length,
              p_suggestion_count: suggestions.length,
            },
          );
          if (digestError) throw digestError;
          notificationsCreated += created ?? 0;
          companiesChecked += 1;
        } catch (cause) {
          failures.push(
            `${companyId}: ${cause instanceof Error ? cause.message : "falha desconhecida"}`,
          );
        }
      }),
    );
  }

  return Response.json(
    {
      ok: failures.length === 0,
      companies: companies?.length ?? 0,
      companiesChecked,
      notificationsCreated,
      failures,
    },
    { status: failures.length === 0 ? 200 : 500 },
  );
}
