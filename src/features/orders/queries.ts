import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Leituras de pedido.
 *
 * O ciclo de status é: `draft` → `awaiting_confirmation` (enviado ao
 * fornecedor) → `awaiting_delivery` (fornecedor confirmou) →
 * `partially_received` → `received`. Cada passo é de uma RPC diferente, e a
 * interface só mostra a ação que o estado atual permite.
 */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_confirmation: "Aguardando confirmação",
  awaiting_delivery: "Aguardando entrega",
  partially_received: "Recebido em parte",
  received: "Recebido",
  cancelled: "Cancelado",
};

export async function listOrders(companyId: string) {
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
      purchase_rounds ( title ),
      order_revisions!order_revisions_company_id_order_id_fkey (
        revision_number, status, delivery_due_date,
        order_revision_items ( requested_quantity, agreed_price )
      )
    `,
    )
    .eq("company_id", companyId)
    .order("order_number", { ascending: false });

  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);

  return (data ?? []).map((order) => {
    const revision = [...(order.order_revisions ?? [])].sort(
      (a, b) => b.revision_number - a.revision_number,
    )[0];
    const items = revision?.order_revision_items ?? [];

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      supplierName: order.suppliers.name,
      roundTitle: order.purchase_rounds?.title ?? null,
      deliveryDueDate: revision?.delivery_due_date ?? null,
      itemCount: items.length,
      total: items.reduce(
        (sum, i) => sum + Number(i.requested_quantity) * Number(i.agreed_price),
        0,
      ),
    };
  });
}

export async function getOrder(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      current_revision_id,
      suppliers!inner ( id, name ),
      purchase_rounds ( id, title )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar pedido: ${error.message}`);
  return data;
}

/** Revisão vigente com seus itens e o quanto de cada um já foi recebido. */
export async function getCurrentRevision(
  companyId: string,
  orderId: string,
  revisionId: string | null,
) {
  if (!revisionId) return null;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("order_revisions")
    .select(
      `
      id,
      revision_number,
      status,
      delivery_due_date,
      sent_at,
      confirmed_at,
      order_revision_items (
        id, product_name_snapshot, requested_quantity, agreed_price,
        purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
        pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol ),
        receipt_items ( logistic_quantity_received, pricing_quantity_received, practiced_price )
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a revisão: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    revisionNumber: data.revision_number,
    status: data.status,
    deliveryDueDate: data.delivery_due_date,
    sentAt: data.sent_at,
    confirmedAt: data.confirmed_at,
    items: (data.order_revision_items ?? []).map((item) => {
      // Um item pode ser recebido em várias remessas; o saldo é o que sobra.
      const recebido = (item.receipt_items ?? []).reduce(
        (sum, r) => sum + Number(r.logistic_quantity_received),
        0,
      );
      return {
        id: item.id,
        productName: item.product_name_snapshot,
        requestedQuantity: Number(item.requested_quantity),
        agreedPrice: Number(item.agreed_price),
        purchaseUnit: item.purchase_unit?.symbol ?? "",
        pricingUnit: item.pricing_unit?.symbol ?? "",
        receivedQuantity: recebido,
        pendingQuantity: Number(item.requested_quantity) - recebido,
      };
    }),
  };
}

export async function listOrderReceipts(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("id, status, received_at, notes, receipt_items ( id )")
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("received_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar recebimentos: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    receivedAt: r.received_at,
    notes: r.notes,
    itemCount: r.receipt_items?.length ?? 0,
  }));
}

/** Divergências de preço detectadas automaticamente no recebimento. */
export async function listOrderDivergences(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("commercial_divergences")
    .select(
      "id, type, status, agreed_value, realized_value, financial_impact, created_at",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar divergências: ${error.message}`);
  }
  return data ?? [];
}
