import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Rodadas com o progresso já calculado pela view v_purchase_round_progress.
 *
 * A ordenação não é enfeite: a view agrupa, e sem `order by` o Postgres não
 * promete ordem alguma — a lista podia aparecer numa sequência diferente a cada
 * visita, sem nada ter mudado. `created_at` entrou na view na 0030 justamente
 * para isto, e o desempate por id garante ordem total quando duas rodadas
 * nascem no mesmo instante.
 */
export async function listRoundsWithProgress(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("v_purchase_round_progress")
    .select(
      `
      purchase_round_id,
      title,
      status,
      total_items,
      total_suppliers,
      suppliers_completed,
      suppliers_pending,
      items_confirmed,
      orders_created,
      created_at
    `,
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .order("purchase_round_id", { ascending: false });

  if (error) throw new Error(`Falha ao listar rodadas: ${error.message}`);
  return data ?? [];
}

export async function getRound(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_rounds")
    .select("id, title, status, notes, started_at, completed_at, created_at")
    .eq("company_id", companyId)
    .eq("id", roundId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar rodada: ${error.message}`);
  return data;
}

export async function listRoundGroups(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_round_groups")
    .select("id, name, status, sort_order")
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Falha ao listar grupos: ${error.message}`);
  return data ?? [];
}

/** Itens da rodada com o nome do produto e as unidades já resolvidos. */
export async function listRoundItems(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotation_items")
    .select(
      `
      id,
      group_id,
      requested_quantity,
      commercial_status,
      notes,
      products!inner ( name ),
      purchase_unit:units!quotation_items_company_id_purchase_unit_id_fkey ( symbol ),
      pricing_unit:units!quotation_items_company_id_pricing_unit_id_fkey ( symbol )
    `,
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("created_at");

  if (error) throw new Error(`Falha ao listar itens: ${error.message}`);
  return data ?? [];
}

export async function listRoundSuppliers(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("round_suppliers")
    .select(
      `
      id,
      supplier_id,
      first_sent_at,
      first_accessed_at,
      completed_at,
      suppliers!inner ( name ),
      supplier_contacts ( name, whatsapp ),
      quotation_responses ( status, submitted_at, quotation_response_items ( id ) )
    `,
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("created_at");

  if (error) {
    throw new Error(`Falha ao listar fornecedores da rodada: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Fornecedores que podem entrar numa rodada: ativos e com contato ativo.
 *
 * Sem contato não há para onde mandar o link, então oferecer o fornecedor na
 * lista só produziria um erro mais adiante.
 */
export async function listSelectableSuppliers(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, supplier_contacts!inner ( id, is_active )")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("supplier_contacts.is_active", true)
    .order("name");

  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return (data ?? []).map((s) => ({ id: s.id, name: s.name }));
}

/** Pedidos com a condição de atraso derivada pela view. */
export async function listOrdersWithDelivery(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("v_order_delivery_status")
    .select(
      "order_id, order_number, supplier_id, status, delivery_due_date, is_overdue, overdue_days",
    )
    .eq("company_id", companyId)
    .order("order_number", { ascending: false });

  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
  return data ?? [];
}
