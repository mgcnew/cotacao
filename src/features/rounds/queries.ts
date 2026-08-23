import "server-only";

import type { RoundFilters } from "@/features/rounds/filters";
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
export async function listRoundsWithProgress(
  companyId: string,
  filters: RoundFilters = {
    situacao: null,
    de: null,
    ate: null,
    busca: null,
  },
) {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("v_purchase_round_progress")
    .select(
      `
      purchase_round_id,
      title,
      notes,
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
    .eq("company_id", companyId);

  if (filters.situacao === "abertas") {
    query = query.in("status", ["draft", "active"]);
  } else if (filters.situacao === "aguardando") {
    // Rodada em andamento com alguém devendo resposta. Só faz sentido entre as
    // ativas: em rascunho ninguém foi convidado ainda.
    query = query.eq("status", "active").gt("suppliers_pending", 0);
  } else if (filters.situacao) {
    query = query.eq("status", filters.situacao);
  }

  if (filters.de) query = query.gte("created_at", `${filters.de}T00:00:00`);
  if (filters.ate) query = query.lte("created_at", `${filters.ate}T23:59:59`);
  if (filters.busca) query = query.ilike("title", `%${filters.busca}%`);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("purchase_round_id", { ascending: false });

  if (error) throw new Error(`Falha ao listar rodadas: ${error.message}`);
  return data ?? [];
}

/** Números do recorte, para o resumo no topo da lista. */
export function summarizeRounds(
  rows: Awaited<ReturnType<typeof listRoundsWithProgress>>,
) {
  const ativas = rows.filter((r) => r.status === "active");

  return {
    quantidade: rows.length,
    emPreparacao: rows.filter((r) => r.status === "draft").length,
    emAndamento: ativas.length,
    aguardandoResposta: ativas.reduce(
      (sum, r) => sum + Number(r.suppliers_pending ?? 0),
      0,
    ),
    pedidosGerados: rows.reduce(
      (sum, r) => sum + Number(r.orders_created ?? 0),
      0,
    ),
  };
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
      supplier_contact_id,
      first_sent_at,
      first_accessed_at,
      completed_at,
      removed_at,
      suppliers!inner ( name ),
      supplier_contacts ( name, whatsapp ),
      supplier_quotation_items ( id, removed_at ),
      quotation_responses ( status, submitted_at, quotation_response_items ( id ) )
    `,
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .is("removed_at", null)
    .order("created_at");

  if (error) {
    throw new Error(`Falha ao listar fornecedores da rodada: ${error.message}`);
  }
  return data ?? [];
}

/** Grupos atualmente atribuídos a cada participante ativo da rodada. */
export async function listRoundSupplierGroups(
  companyId: string,
  roundSupplierIds: string[],
): Promise<Map<string, string[]>> {
  if (roundSupplierIds.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("round_supplier_groups")
    .select("round_supplier_id, group_id")
    .eq("company_id", companyId)
    .in("round_supplier_id", roundSupplierIds)
    .is("removed_at", null);

  if (error) {
    throw new Error(`Falha ao listar grupos dos fornecedores: ${error.message}`);
  }

  const porFornecedor = new Map<string, string[]>();
  for (const row of data ?? []) {
    const groups = porFornecedor.get(row.round_supplier_id) ?? [];
    groups.push(row.group_id);
    porFornecedor.set(row.round_supplier_id, groups);
  }
  return porFornecedor;
}

/**
 * Fornecedores que podem entrar numa rodada: ativos e com contato ativo.
 *
 * Sem contato não há para onde mandar o link, então oferecer o fornecedor na
 * lista só produziria um erro mais adiante.
 */
/**
 * Contatos ativos dos fornecedores desta rodada, agrupados por fornecedor.
 *
 * Uma consulta só para a tabela inteira: um pedido por linha seria uma consulta
 * por fornecedor, e a Central da Rodada lista todos de uma vez.
 */
export async function listRoundSupplierContacts(
  companyId: string,
  supplierIds: string[],
): Promise<Map<string, { id: string; name: string; role: string | null }[]>> {
  if (supplierIds.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, name, role, supplier_id, is_primary")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .in("supplier_id", supplierIds)
    .order("is_primary", { ascending: false })
    .order("name");

  if (error) throw new Error(`Falha ao listar contatos: ${error.message}`);

  const porFornecedor = new Map<
    string,
    { id: string; name: string; role: string | null }[]
  >();
  for (const c of data ?? []) {
    const lista = porFornecedor.get(c.supplier_id) ?? [];
    lista.push({ id: c.id, name: c.name, role: c.role });
    porFornecedor.set(c.supplier_id, lista);
  }
  return porFornecedor;
}

export async function listSelectableSuppliers(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, supplier_contacts!inner ( id, name, role, whatsapp, is_active, is_primary )",
    )
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("supplier_contacts.is_active", true)
    .order("name");

  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    contacts: s.supplier_contacts
      .filter((c) => c.is_active)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
  }));
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
