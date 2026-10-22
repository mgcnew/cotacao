import "server-only";

import {
  TOLERANCIA_PRECO,
  rankInvoicesForOrder,
  type MatchEvidence,
  type OpenOrder,
} from "@/features/receipts/historical-order-match";
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
  /** Passa no critério do casamento comum: o conteúdo bate com o pedido. */
  qualifies: boolean;
  /** Por que esta nota parece (ou não) ser deste pedido, em uma frase. */
  summary: string;
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
    const list = invoicesBySupplier.get(nota.supplier_id) ?? [];
    list.push({
      importId: nota.id,
      label: `NF-e ${nota.invoice_number}${nota.invoice_series ? `/${nota.invoice_series}` : ""}`,
      issuedAt: nota.issued_at,
      prices,
      qualifies: false,
      summary: "",
    });
    invoicesBySupplier.set(nota.supplier_id, list);
  }

  // As notas candidatas de cada recebimento, da mais parecida para a menos: a
  // mesma pontuação do casamento comum, com a chegada como data de referência.
  const orders = await listOrdersForRanking(supabase, companyId, [
    ...new Set(groups.map((group) => group.orderId)),
  ]);
  await Promise.all(
    groups.map(async (group) => {
      const order = orders.get(group.orderId);
      if (!order) return;
      const ranked = await rankInvoicesForOrder(companyId, {
        ...order,
        arrivalDay: group.receivedAt ? diaDaLoja(group.receivedAt) : null,
      });
      const known = new Map(
        (invoicesBySupplier.get(group.supplierId) ?? []).map((invoice) => [
          invoice.importId,
          invoice,
        ]),
      );
      const products = new Set(group.items.map((item) => item.productId));
      group.invoices = ranked
        .flatMap((entry) => {
          const invoice = known.get(entry.importId);
          if (!invoice) return [];
          // Fica quem passa no critério, ou ao menos tem preço de produto
          // deste recebimento: uma nota que não traz nada dele não ajuda.
          const useful =
            entry.evidence.qualifies ||
            invoice.prices.some((price) => products.has(price.productId));
          return useful
            ? [
                {
                  ...invoice,
                  qualifies: entry.evidence.qualifies,
                  summary: describeEvidence(
                    entry.evidence,
                    entry.daysFromArrival,
                    Boolean(group.receivedAt),
                  ),
                },
              ]
            : [];
        })
        // Quem passa no critério vem antes de quem só tem pontuação alta; a
        // ordenação é estável, então dentro de cada grupo segue a pontuação.
        .sort((a, b) => Number(b.qualifies) - Number(a.qualifies))
        .slice(0, 8);
    }),
  );

  return groups.sort((a, b) =>
    (a.receivedAt ?? a.checkedAt ?? "").localeCompare(
      b.receivedAt ?? b.checkedAt ?? "",
    ),
  );
}

const DIA_DA_LOJA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function diaDaLoja(instante: string): string {
  return DIA_DA_LOJA.format(new Date(instante));
}

/** Uma frase com o porquê, para a pessoa decidir sem abrir a nota. */
function describeEvidence(
  evidence: MatchEvidence,
  daysFromArrival: number,
  hasArrival: boolean,
): string {
  const parts: string[] = [];
  if (evidence.citedInInvoice) parts.push("cita este pedido");
  if (evidence.invoiceLines > 0) {
    parts.push(
      `${evidence.invoiceLinesInOrder} de ${evidence.invoiceLines} itens da nota são deste pedido`,
    );
  }
  if (evidence.pricedLines > 0) {
    parts.push(
      `${evidence.pricedLinesWithinTolerance} de ${evidence.pricedLines} preços até ${Math.round(TOLERANCIA_PRECO * 100)}% do combinado`,
    );
  }
  const reference = hasArrival ? "da chegada" : "do prazo";
  parts.push(
    daysFromArrival === 0
      ? `emitida no dia ${reference}`
      : `emitida ${Math.abs(daysFromArrival)} ${Math.abs(daysFromArrival) === 1 ? "dia" : "dias"} ${daysFromArrival < 0 ? "antes" : "depois"} ${reference}`,
  );
  return parts.join(" · ");
}

/** Os pedidos como o casamento os enxerga, só com o que a pontuação usa. */
async function listOrdersForRanking(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
  orderIds: string[],
): Promise<Map<string, OpenOrder>> {
  const result = new Map<string, OpenOrder>();
  if (orderIds.length === 0) return result;
  const { data } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      supplier_id,
      created_at,
      current_revision:order_revisions!orders_current_revision_fk (
        delivery_due_date,
        order_revision_items (
          product_id,
          product_name_snapshot,
          requested_quantity,
          agreed_price,
          purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
          pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol )
        )
      )
    `,
    )
    .eq("company_id", companyId)
    .in("id", orderIds);

  for (const order of data ?? []) {
    result.set(order.id, {
      id: order.id,
      orderNumber: order.order_number,
      supplierId: order.supplier_id,
      createdDay: diaDaLoja(order.created_at),
      deliveryDueDate: order.current_revision?.delivery_due_date ?? null,
      lines: (order.current_revision?.order_revision_items ?? []).map(
        (item) => ({
          productId: item.product_id,
          productName: item.product_name_snapshot,
          requestedQuantity: Number(item.requested_quantity),
          purchaseUnit: item.purchase_unit?.symbol ?? "",
          agreedPrice: Number(item.agreed_price),
          pricingUnit: item.pricing_unit?.symbol ?? "",
        }),
      ),
      openReceiptId: null,
    });
  }
  return result;
}
