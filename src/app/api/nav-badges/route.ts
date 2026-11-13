import { getActiveCompany, getUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Contagens ao lado dos subitens do menu: hoje, as divergências de
 * recebimento a tratar, que antes eram um botão na página de pedidos.
 *
 * Rota e não conta no layout: o layout roda de novo a cada prefetch, e o
 * banco já é o gargalo. Aqui o menu pergunta ao abrir e ao entrar em Pedidos.
 * Conta o mesmo que a Central: `pending`, de pedido não cancelado.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const company = await getActiveCompany();
  if (!company) {
    return Response.json({ error: "Acesso não permitido." }, { status: 403 });
  }
  if (!company.permissions.includes("commercial_divergence.view")) {
    return Response.json({ divergencias: 0 });
  }

  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("commercial_divergences")
    .select("id, orders!inner(status)", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("status", "pending")
    .neq("orders.status", "cancelled");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(
    { divergencias: count ?? 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
