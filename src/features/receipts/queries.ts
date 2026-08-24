import "server-only";

import { getCurrentRevision, getOrder } from "@/features/orders/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listReceivingBoard(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      suppliers!inner ( name ),
      current_revision:order_revisions!orders_current_revision_fk (
        id,
        delivery_due_date,
        order_revision_items (
          id,
          product_name_snapshot,
          requested_quantity,
          agreed_price,
          purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
          pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol ),
          receipt_items ( logistic_quantity_received )
        )
      ),
      receipts (
        id, status, received_at, invoice_number, invoice_total, notes, created_at
      )
    `,
    )
    .eq("company_id", companyId)
    .in("status", ["awaiting_delivery", "partially_received"])
    .order("created_at", { ascending: false });

  if (error)
    throw new Error(`Falha ao carregar recebimentos: ${error.message}`);

  const rows = (data ?? []).map((order) => {
    const revision = order.current_revision;
    const items = (revision?.order_revision_items ?? []).map((item) => {
      const received = (item.receipt_items ?? []).reduce(
        (sum, receiptItem) =>
          sum + Number(receiptItem.logistic_quantity_received),
        0,
      );
      return {
        id: item.id,
        productName: item.product_name_snapshot,
        requestedQuantity: Number(item.requested_quantity),
        receivedQuantity: received,
        pendingQuantity: Math.max(
          Number(item.requested_quantity) - received,
          0,
        ),
        agreedPrice: Number(item.agreed_price),
        purchaseUnit: item.purchase_unit?.symbol ?? "",
        pricingUnit: item.pricing_unit?.symbol ?? "",
      };
    });
    const draft =
      order.receipts?.find((receipt) => receipt.status === "draft") ?? null;
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: order.status,
      supplierName: order.suppliers.name,
      deliveryDueDate: revision?.delivery_due_date ?? null,
      expectedTotal: items.reduce(
        (sum, item) => sum + item.requestedQuantity * item.agreedPrice,
        0,
      ),
      items,
      draftReceipt: draft
        ? {
            id: draft.id,
            receivedAt: draft.received_at,
            invoiceNumber: draft.invoice_number,
            invoiceTotal:
              draft.invoice_total === null ? null : Number(draft.invoice_total),
            notes: draft.notes,
            createdAt: draft.created_at,
          }
        : null,
    };
  });

  return {
    expected: rows.filter((row) => !row.draftReceipt),
    awaitingCheck: rows.filter((row) => row.draftReceipt),
  };
}

export async function listRecentPostedReceipts(companyId: string, limit = 30) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      `
      id, order_id, received_at, checked_at, invoice_number, invoice_total, notes,
      orders!inner ( order_number, suppliers!inner ( name ) ),
      receipt_items ( id, pricing_quantity_received, practiced_price )
    `,
    )
    .eq("company_id", companyId)
    .eq("status", "posted")
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao listar conferências: ${error.message}`);

  return (data ?? []).map((receipt) => ({
    id: receipt.id,
    orderId: receipt.order_id,
    orderNumber: receipt.orders.order_number,
    supplierName: receipt.orders.suppliers.name,
    receivedAt: receipt.received_at,
    checkedAt: receipt.checked_at,
    invoiceNumber: receipt.invoice_number,
    invoiceTotal:
      receipt.invoice_total === null ? null : Number(receipt.invoice_total),
    calculatedTotal: (receipt.receipt_items ?? []).reduce(
      (sum, item) =>
        sum +
        Number(item.pricing_quantity_received) * Number(item.practiced_price),
      0,
    ),
    itemCount: receipt.receipt_items?.length ?? 0,
    notes: receipt.notes,
  }));
}

export async function getReceiptConference(
  companyId: string,
  receiptId: string,
) {
  const supabase = await createServerSupabaseClient();
  const { data: receipt, error } = await supabase
    .from("receipts")
    .select(
      "id, order_id, status, received_at, invoice_number, invoice_series, invoice_total, notes, checked_at",
    )
    .eq("company_id", companyId)
    .eq("id", receiptId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao abrir a conferência: ${error.message}`);
  if (!receipt) return null;

  const order = await getOrder(companyId, receipt.order_id);
  if (!order) return null;
  const revision = await getCurrentRevision(
    companyId,
    order.id,
    order.current_revision_id,
  );

  return {
    receipt: {
      id: receipt.id,
      status: receipt.status,
      receivedAt: receipt.received_at,
      invoiceNumber: receipt.invoice_number,
      invoiceSeries: receipt.invoice_series,
      invoiceTotal:
        receipt.invoice_total === null ? null : Number(receipt.invoice_total),
      notes: receipt.notes,
      checkedAt: receipt.checked_at,
    },
    order,
    revision,
  };
}
