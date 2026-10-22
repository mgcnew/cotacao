import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Recebimentos fechados "sem nota" cujo preço ainda é o negociado.
 *
 * A baixa não esperou pela nota; o preço ficou marcado como não conferido
 * (migration 0120). Esta lista é a fila de quem precisa de nota: cada grupo é
 * um recebimento, com os itens que ainda esperam preço.
 *
 * Se a migration ainda não foi aplicada, a coluna não existe e a leitura falha:
 * devolvemos vazio em vez de derrubar a tela de Recebimentos, que existia antes
 * desta função e precisa continuar abrindo.
 */

export type PendingPriceItem = {
  receiptItemId: string;
  productId: string | null;
  productName: string;
  logisticQuantity: number;
  pricingQuantity: number;
  negotiatedPrice: number;
  purchaseUnit: string;
  pricingUnit: string;
  sameUnit: boolean;
};

/** Uma nota já importada do mesmo fornecedor, com o preço por produto. */
export type PendingPriceInvoice = {
  importId: string;
  label: string;
  issuedAt: string;
  prices: {
    productId: string;
    price: number;
    pricingQuantity: number | null;
  }[];
};

export type PendingPriceReceipt = {
  receiptId: string;
  orderId: string;
  orderNumber: number;
  supplierId: string;
  supplierName: string;
  receivedAt: string | null;
  checkedAt: string | null;
  items: PendingPriceItem[];
  invoices: PendingPriceInvoice[];
};

export async function listPendingPriceConfirmations(
  companyId: string,
): Promise<PendingPriceReceipt[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      `
      id,
      receipt_id,
      logistic_quantity_received,
      pricing_quantity_received,
      order_revision_items!inner (
        product_id,
        product_name_snapshot,
        agreed_price,
        purchase_unit_id,
        pricing_unit_id,
        purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
        pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol )
      ),
      receipts!inner (
        id,
        order_id,
        status,
        received_at,
        checked_at,
        orders!inner ( order_number, supplier_id, suppliers!inner ( name ) )
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("price_unverified", true)
    .eq("receipts.status", "posted");

  if (error || !data) return [];

  const byReceipt = new Map<string, PendingPriceReceipt>();
  for (const row of data) {
    const receipt = row.receipts;
    const revision = row.order_revision_items;
    let group = byReceipt.get(row.receipt_id);
    if (!group) {
      group = {
        receiptId: row.receipt_id,
        orderId: receipt.order_id,
        orderNumber: receipt.orders.order_number,
        supplierId: receipt.orders.supplier_id,
        supplierName: receipt.orders.suppliers.name,
        receivedAt: receipt.received_at,
        checkedAt: receipt.checked_at,
        items: [],
        invoices: [],
      };
      byReceipt.set(row.receipt_id, group);
    }
    group.items.push({
      receiptItemId: row.id,
      productId: revision.product_id,
      productName: revision.product_name_snapshot,
      logisticQuantity: Number(row.logistic_quantity_received),
      pricingQuantity: Number(row.pricing_quantity_received),
      negotiatedPrice: Number(revision.agreed_price),
      purchaseUnit: revision.purchase_unit?.symbol ?? "",
      pricingUnit: revision.pricing_unit?.symbol ?? "",
      sameUnit: revision.purchase_unit_id === revision.pricing_unit_id,
    });
  }

  const groups = [...byReceipt.values()];
  if (groups.length === 0) return groups;

  // Notas do mesmo fornecedor que já passaram pelo histórico fiscal. Só entram
  // os itens já associados a um produto, porque são os que têm preço pronto.
  const suppliers = [...new Set(groups.map((group) => group.supplierId))];
  const notas = await supabase
    .from("historical_nfe_imports")
    .select(
      "id, supplier_id, invoice_number, invoice_series, issued_at, historical_nfe_items ( product_id, reconciliation_status, practiced_price, pricing_quantity )",
    )
    .eq("company_id", companyId)
    .in("status", ["draft", "posted"])
    .in("supplier_id", suppliers)
    .order("issued_at", { ascending: false })
    .limit(200);

  const invoicesBySupplier = new Map<string, PendingPriceInvoice[]>();
  for (const nota of notas.data ?? []) {
    if (!nota.supplier_id) continue;
    const prices = (nota.historical_nfe_items ?? []).flatMap((item) =>
      item.reconciliation_status === "matched" &&
      item.product_id &&
      item.practiced_price !== null
        ? [
            {
              productId: item.product_id,
              price: Number(item.practiced_price),
              pricingQuantity:
                item.pricing_quantity === null
                  ? null
                  : Number(item.pricing_quantity),
            },
          ]
        : [],
    );
    if (prices.length === 0) continue;
    const list = invoicesBySupplier.get(nota.supplier_id) ?? [];
    list.push({
      importId: nota.id,
      label: `NF-e ${nota.invoice_number}${nota.invoice_series ? `/${nota.invoice_series}` : ""}`,
      issuedAt: nota.issued_at,
      prices,
    });
    invoicesBySupplier.set(nota.supplier_id, list);
  }

  for (const group of groups) {
    // Só as notas que cobrem ao menos um produto deste recebimento.
    const products = new Set(group.items.map((item) => item.productId));
    group.invoices = (invoicesBySupplier.get(group.supplierId) ?? []).filter(
      (invoice) =>
        invoice.prices.some((price) => products.has(price.productId)),
    );
  }

  return groups.sort((a, b) =>
    (a.receivedAt ?? a.checkedAt ?? "").localeCompare(
      b.receivedAt ?? b.checkedAt ?? "",
    ),
  );
}
