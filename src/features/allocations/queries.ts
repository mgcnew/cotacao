import "server-only";

import { getRoundComparison } from "@/features/quotations/comparison";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Quadro de alocação: para cada item da rodada, quem respondeu, por quanto, e
 * o que já foi decidido.
 *
 * Reaproveita `getRoundComparison` de propósito — decidir de quem comprar é
 * ler a mesma matriz que se usa para comparar, e duplicar a montagem faria as
 * duas telas divergirem com o tempo.
 */

export type AllocationRow = {
  allocationId: string;
  quotationItemId: string;
  supplierId: string;
  allocatedQuantity: number;
  selectedPrice: number;
  status: string;
};

export async function listAllocations(
  companyId: string,
  roundId: string,
): Promise<AllocationRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("purchase_allocations")
    .select(
      "id, quotation_item_id, supplier_id, allocated_quantity, selected_price, status",
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    // Cancelada saiu de cena: continua no banco para o histórico, mas não
    // conta na cobertura do item nem vira pedido.
    .neq("status", "cancelled")
    .order("created_at");

  if (error) throw new Error(`Falha ao listar alocações: ${error.message}`);

  return (data ?? []).map((row) => ({
    allocationId: row.id,
    quotationItemId: row.quotation_item_id,
    supplierId: row.supplier_id,
    allocatedQuantity: Number(row.allocated_quantity),
    selectedPrice: Number(row.selected_price),
    status: row.status,
  }));
}

export async function getAllocationBoard(companyId: string, roundId: string) {
  const [comparison, allocations] = await Promise.all([
    getRoundComparison(companyId, roundId),
    listAllocations(companyId, roundId),
  ]);

  const byItem = new Map<string, AllocationRow[]>();
  for (const a of allocations) {
    const list = byItem.get(a.quotationItemId) ?? [];
    list.push(a);
    byItem.set(a.quotationItemId, list);
  }

  return { ...comparison, allocationsByItem: byItem, allocations };
}

/** Pedidos gerados a partir da rodada, com o total de cada um. */
export async function listRoundOrders(companyId: string, roundId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      created_at,
      suppliers!inner ( name ),
      order_revisions!order_revisions_company_id_order_id_fkey ( id, revision_number, status, delivery_due_date,
        order_revision_items ( requested_quantity, agreed_price, product_name_snapshot ) )
    `,
    )
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("created_at");

  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);

  return (data ?? []).map((order) => {
    // `orders` referencia `order_revisions` duas vezes — pela revisão vigente e
    // pelo order_id da revisão. O embed precisa nomear a FK, senão o PostgREST
    // escolhe uma e o tipo vem como objeto único em vez de lista.
    const revision = [...(order.order_revisions ?? [])].sort(
      (a, b) => b.revision_number - a.revision_number,
    )[0];

    const items = revision?.order_revision_items ?? [];
    const total = items.reduce(
      (sum, item) =>
        sum + Number(item.requested_quantity) * Number(item.agreed_price),
      0,
    );

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      supplierName: order.suppliers.name,
      deliveryDueDate: revision?.delivery_due_date ?? null,
      itemCount: items.length,
      total,
    };
  });
}
