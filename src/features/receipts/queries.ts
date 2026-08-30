import "server-only";

import { getCurrentRevision, getOrder } from "@/features/orders/queries";
import type { NfeFiscalTotals } from "@/features/receipts/nfe";
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
      `
      id, order_id, status, received_at, invoice_number, invoice_series,
      invoice_total, nfe_totals, notes, checked_at,
      receipt_documents (
        id, file_name, access_key, storage_path, created_at
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", receiptId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao abrir a conferência: ${error.message}`);
  if (!receipt) return null;

  const documents = await Promise.all(
    (receipt.receipt_documents ?? []).map(async (document) => {
      const signed = await supabase.storage
        .from("receipt-documents")
        .createSignedUrl(document.storage_path, 600, {
          download: document.file_name,
        });
      return {
        id: document.id,
        fileName: document.file_name,
        accessKey: document.access_key,
        createdAt: document.created_at,
        downloadUrl: signed.data?.signedUrl ?? null,
      };
    }),
  );

  const order = await getOrder(companyId, receipt.order_id);
  if (!order) return null;
  const revision = await getCurrentRevision(
    companyId,
    order.id,
    order.current_revision_id,
  );

  const productIds = revision?.items.map((item) => item.productId) ?? [];
  const [companyResult, barcodeResult, aliasResult, unitRuleResult] =
    await Promise.all([
      supabase
        .from("companies")
        .select("document_number")
        .eq("id", companyId)
        .maybeSingle(),
      productIds.length
        ? supabase
            .from("product_barcodes")
            .select("product_id, code")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? supabase
            .from("supplier_product_aliases")
            .select("product_id, supplier_code, supplier_name, barcode")
            .eq("company_id", companyId)
            .eq("supplier_id", order.suppliers.id)
            .in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? supabase
            .from("supplier_product_nfe_unit_rules")
            .select("id, product_id, xml_unit, target_unit_id, mode, factor")
            .eq("company_id", companyId)
            .eq("supplier_id", order.suppliers.id)
            .in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (companyResult.error) {
    throw new Error(
      `Falha ao validar o destinatário da nota: ${companyResult.error.message}`,
    );
  }
  if (barcodeResult.error) {
    throw new Error(
      `Falha ao carregar códigos dos produtos: ${barcodeResult.error.message}`,
    );
  }
  if (aliasResult.error) {
    throw new Error(
      `Falha ao carregar nomes aprendidos da NF-e: ${aliasResult.error.message}`,
    );
  }
  if (unitRuleResult.error) {
    throw new Error(
      `Falha ao carregar conversões aprendidas da NF-e: ${unitRuleResult.error.message}`,
    );
  }

  const barcodesByProduct = new Map<string, string[]>();
  for (const barcode of barcodeResult.data ?? []) {
    const current = barcodesByProduct.get(barcode.product_id) ?? [];
    current.push(barcode.code);
    barcodesByProduct.set(barcode.product_id, current);
  }
  const aliasesByProduct = new Map<
    string,
    {
      supplierCode: string | null;
      supplierName: string;
      barcode: string | null;
    }[]
  >();
  for (const alias of aliasResult.data ?? []) {
    const current = aliasesByProduct.get(alias.product_id) ?? [];
    current.push({
      supplierCode: alias.supplier_code,
      supplierName: alias.supplier_name,
      barcode: alias.barcode,
    });
    aliasesByProduct.set(alias.product_id, current);
  }

  return {
    receipt: {
      id: receipt.id,
      status: receipt.status,
      receivedAt: receipt.received_at,
      invoiceNumber: receipt.invoice_number,
      invoiceSeries: receipt.invoice_series,
      invoiceTotal:
        receipt.invoice_total === null ? null : Number(receipt.invoice_total),
      nfeTotals:
        (receipt.nfe_totals as unknown as NfeFiscalTotals | null) ?? null,
      notes: receipt.notes,
      checkedAt: receipt.checked_at,
      documents: documents.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    },
    order,
    companyDocument: companyResult.data?.document_number ?? null,
    supplierDocument: order.suppliers.document_number ?? null,
    revision: revision
      ? {
          ...revision,
          items: revision.items.map((item) => ({
            ...item,
            barcodes: barcodesByProduct.get(item.productId) ?? [],
            aliases: aliasesByProduct.get(item.productId) ?? [],
            unitRules: (unitRuleResult.data ?? [])
              .filter(
                (rule) =>
                  rule.product_id === item.productId &&
                  [item.purchaseUnitId, item.pricingUnitId].includes(
                    rule.target_unit_id,
                  ),
              )
              .map((rule) => ({
                id: rule.id,
                xmlUnit: rule.xml_unit,
                targetUnit:
                  rule.target_unit_id === item.purchaseUnitId
                    ? item.purchaseUnit
                    : item.pricingUnit,
                mode: rule.mode as "fixed_factor" | "manual_quantity",
                factor: rule.factor === null ? null : Number(rule.factor),
              })),
          })),
        }
      : null,
  };
}
