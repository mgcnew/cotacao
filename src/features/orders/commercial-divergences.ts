import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PendingCommercialDivergence = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  orderId: string;
  orderNumber: number | null;
  supplierName: string;
  productName: string;
  receiptId: string | null;
  invoiceNumber: string | null;
  purchaseUnit: string | null;
  pricingUnit: string | null;
  agreedPrice: number | null;
  practicedPrice: number | null;
  agreedQuantity: number | null;
  receivedQuantity: number | null;
  pricingQuantity: number | null;
  financialImpact: number | null;
};

function jsonNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  const parsed = Number(raw);
  return raw !== null && raw !== undefined && Number.isFinite(parsed)
    ? parsed
    : null;
}

/** Fila operacional: pendentes e contestações que ainda exigem acompanhamento. */
export async function listPendingCommercialDivergences(
  companyId: string,
): Promise<PendingCommercialDivergence[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("commercial_divergences")
    .select(
      "id, type, status, created_at, order_id, supplier_id, order_revision_item_id, receipt_item_id, agreed_value, realized_value, financial_impact",
    )
    .eq("company_id", companyId)
    .in("status", ["pending", "to_dispute"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar divergências: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const supplierIds = [...new Set(rows.map((row) => row.supplier_id))];
  const revisionItemIds = [
    ...new Set(rows.map((row) => row.order_revision_item_id)),
  ];
  const receiptItemIds = [...new Set(rows.map((row) => row.receipt_item_id))];

  const [orders, suppliers, revisionItems, receiptItems] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("company_id", companyId)
      .in("id", orderIds),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", supplierIds),
    supabase
      .from("order_revision_items")
      .select(
        `
          id, product_name_snapshot,
          purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
          pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol )
        `,
      )
      .eq("company_id", companyId)
      .in("id", revisionItemIds),
    supabase
      .from("receipt_items")
      .select("id, receipt_id, practiced_price, pricing_quantity_received")
      .eq("company_id", companyId)
      .in("id", receiptItemIds),
  ]);

  const referenceError =
    orders.error ??
    suppliers.error ??
    revisionItems.error ??
    receiptItems.error;
  if (referenceError) {
    throw new Error(
      `Falha ao identificar os dados da divergência: ${referenceError.message}`,
    );
  }

  const receiptIds = [
    ...new Set((receiptItems.data ?? []).map((item) => item.receipt_id)),
  ];
  const receipts = receiptIds.length
    ? await supabase
        .from("receipts")
        .select("id, invoice_number")
        .eq("company_id", companyId)
        .in("id", receiptIds)
    : { data: [], error: null };
  if (receipts.error) {
    throw new Error(`Falha ao identificar a nota: ${receipts.error.message}`);
  }

  const orderById = new Map((orders.data ?? []).map((row) => [row.id, row]));
  const supplierById = new Map(
    (suppliers.data ?? []).map((row) => [row.id, row.name]),
  );
  const productByItemId = new Map(
    (revisionItems.data ?? []).map((row) => [row.id, row]),
  );
  const receiptItemById = new Map(
    (receiptItems.data ?? []).map((row) => [row.id, row]),
  );
  const invoiceByReceiptId = new Map(
    (receipts.data ?? []).map((row) => [row.id, row.invoice_number]),
  );

  return rows
    .filter((row) => orderById.get(row.order_id)?.status !== "cancelled")
    .map((row) => {
      const order = orderById.get(row.order_id);
      const receiptItem = receiptItemById.get(row.receipt_item_id);
      const receiptId = receiptItem?.receipt_id ?? null;
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        createdAt: row.created_at,
        orderId: row.order_id,
        orderNumber: order?.order_number ?? null,
        supplierName:
          supplierById.get(row.supplier_id) ?? "Fornecedor não identificado",
        productName:
          productByItemId.get(row.order_revision_item_id)
            ?.product_name_snapshot ?? "Produto não identificado",
        receiptId,
        invoiceNumber: receiptId
          ? (invoiceByReceiptId.get(receiptId) ?? null)
          : null,
        purchaseUnit:
          productByItemId.get(row.order_revision_item_id)?.purchase_unit
            ?.symbol ?? null,
        pricingUnit:
          productByItemId.get(row.order_revision_item_id)?.pricing_unit
            ?.symbol ?? null,
        agreedPrice:
          row.type === "price" ? jsonNumber(row.agreed_value, "price") : null,
        practicedPrice:
          row.type === "price"
            ? (jsonNumber(row.realized_value, "price") ??
              (receiptItem ? Number(receiptItem.practiced_price) : null))
            : null,
        agreedQuantity:
          row.type === "quantity"
            ? jsonNumber(row.agreed_value, "pending_quantity")
            : null,
        receivedQuantity:
          row.type === "quantity"
            ? jsonNumber(row.realized_value, "received_quantity")
            : null,
        pricingQuantity: receiptItem
          ? Number(receiptItem.pricing_quantity_received)
          : null,
        financialImpact:
          row.financial_impact === null ? null : Number(row.financial_impact),
      };
    })
    .sort((a, b) => (b.financialImpact ?? 0) - (a.financialImpact ?? 0));
}
