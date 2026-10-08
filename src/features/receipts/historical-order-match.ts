import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * NF-e do histórico fiscal que parece ser a nota de um pedido sem entrada.
 *
 * O caso: o pedido foi feito, a mercadoria chegou, ninguém registrou a chegada
 * — e dias depois o XML entra pelo histórico fiscal. Ali ele viraria uma compra
 * avulsa, o pedido ficaria "a receber" para sempre e o preço praticado nunca
 * seria conferido contra o negociado.
 *
 * A sugestão só é feita, nunca executada: nota no pedido errado bagunça o
 * histórico de preços e o desempenho do fornecedor.
 *
 * QUANDO UM PEDIDO É CANDIDATO
 *
 * - mesmo fornecedor da nota (reconhecido pelo CNPJ na importação);
 * - pedido que ainda pode receber: aguardando entrega ou entregue em parte,
 *   com a revisão vigente confirmada — as mesmas condições de registrar a
 *   chegada;
 * - nota emitida a partir da véspera do pedido e até
 *   `JANELA_APOS_PRAZO_DIAS` depois do prazo de entrega (ou da data do pedido,
 *   quando não há prazo).
 *
 * QUANDO A SUGESTÃO APARECE
 *
 * Fornecedor e data só dizem que a nota *poderia* ser do pedido. Para sugerir,
 * o conteúdo precisa bater:
 *
 * - ao menos `MIN_NOTA_NO_PEDIDO` dos itens da nota são produtos do pedido. A
 *   régua é sobre a nota, e não sobre o pedido, de propósito: entrega dividida
 *   em várias notas e entrega parcial são comuns, e cada nota delas traz só
 *   parte do pedido — mas tudo o que ela traz foi pedido. Medido em 08/10/2026
 *   nos dados reais: as notas verdadeiras davam 100% por esse lado e 40–75%
 *   pelo outro; o ruído dava 0%;
 * - a maioria dos itens com preço está a até `TOLERANCIA_PRECO` do negociado.
 *   Diferença maior num item isolado é divergência para a conferência, não
 *   motivo para esconder a nota;
 * - exceção: o número do pedido escrito no XML (`xPed`) basta sozinho.
 *
 * Itens da nota sem produto associado contam como fora do pedido. Um rascunho
 * ainda sem associação, portanto, só é sugerido quando cita o pedido.
 */

export const JANELA_APOS_PRAZO_DIAS = 7;
export const MIN_NOTA_NO_PEDIDO = 0.9;
export const TOLERANCIA_PRECO = 0.15;

const DIA_DA_LOJA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (AAAA-MM-DD) de um instante, no fuso da loja. */
function diaDaLoja(instante: string): string {
  return DIA_DA_LOJA.format(new Date(instante));
}

function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + dias)).toISOString().slice(0, 10);
}

function distanciaEmDias(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

export type OrderLine = {
  productId: string;
  productName: string;
  requestedQuantity: number;
  purchaseUnit: string;
  agreedPrice: number;
  pricingUnit: string;
};

export type OpenOrder = {
  id: string;
  orderNumber: number;
  supplierId: string;
  createdDay: string;
  deliveryDueDate: string | null;
  lines: OrderLine[];
  openReceiptId: string | null;
};

export type InvoiceLine = {
  productId: string | null;
  ignored: boolean;
  description: string;
  quantity: number;
  unit: string | null;
  practicedPrice: number | null;
};

export type InvoiceForMatch = {
  supplierId: string | null;
  issuedAt: string;
  lines: InvoiceLine[];
  purchaseOrderRefs?: Set<string>;
};

export type MatchEvidence = {
  /** Itens da nota que contam (os ignorados na conciliação ficam de fora). */
  invoiceLines: number;
  /** Desses, quantos são produtos do pedido. */
  invoiceLinesInOrder: number;
  /** Produtos do pedido que aparecem na nota. */
  orderLinesCovered: number;
  orderLines: number;
  /** Itens com preço praticado comparável, e quantos dentro da tolerância. */
  pricedLines: number;
  pricedLinesWithinTolerance: number;
  /** O número do pedido aparece escrito na nota. */
  citedInInvoice: boolean;
  qualifies: boolean;
  score: number;
};

/** A nota cabe na janela do pedido? */
function dentroDaJanela(issuedDay: string, order: OpenOrder): boolean {
  const inicio = somarDias(order.createdDay, -1);
  const fim = somarDias(
    order.deliveryDueDate ?? order.createdDay,
    JANELA_APOS_PRAZO_DIAS,
  );
  return issuedDay >= inicio && issuedDay <= fim;
}

/** Fornecedor, janela e conteúdo — `null` quando nem é candidato. */
export function evaluateInvoiceForOrder(
  invoice: InvoiceForMatch,
  order: OpenOrder,
): MatchEvidence | null {
  if (!invoice.supplierId || invoice.supplierId !== order.supplierId)
    return null;
  const issuedDay = diaDaLoja(invoice.issuedAt);
  if (!dentroDaJanela(issuedDay, order)) return null;

  const byProduct = new Map(order.lines.map((line) => [line.productId, line]));
  const relevant = invoice.lines.filter((line) => !line.ignored);
  const inOrder = relevant.filter(
    (line) => line.productId && byProduct.has(line.productId),
  );
  const priced = inOrder.filter(
    (line) =>
      line.practicedPrice !== null &&
      (byProduct.get(line.productId!)?.agreedPrice ?? 0) > 0,
  );
  const withinTolerance = priced.filter((line) => {
    const agreed = byProduct.get(line.productId!)!.agreedPrice;
    return Math.abs(line.practicedPrice! / agreed - 1) <= TOLERANCIA_PRECO;
  });
  const covered = new Set(inOrder.map((line) => line.productId)).size;
  const citedInInvoice =
    invoice.purchaseOrderRefs?.has(String(order.orderNumber)) ?? false;

  const share = relevant.length > 0 ? inOrder.length / relevant.length : 0;
  const priceOk =
    priced.length === 0 || withinTolerance.length / priced.length >= 0.5;
  const qualifies = citedInInvoice || (share >= MIN_NOTA_NO_PEDIDO && priceOk);

  const cobertura = order.lines.length > 0 ? covered / order.lines.length : 0;
  const referencia = order.deliveryDueDate ?? order.createdDay;
  const proximidade = Math.max(
    0,
    1 - Math.abs(distanciaEmDias(issuedDay, referencia)) / 10,
  );

  return {
    invoiceLines: relevant.length,
    invoiceLinesInOrder: inOrder.length,
    orderLinesCovered: covered,
    orderLines: order.lines.length,
    pricedLines: priced.length,
    pricedLinesWithinTolerance: withinTolerance.length,
    citedInInvoice,
    qualifies,
    score:
      (citedInInvoice ? 100 : 0) +
      share * 40 +
      cobertura * 30 +
      proximidade * 20,
  };
}

/**
 * Pedidos que ainda podem receber, dos fornecedores informados — ou de todos.
 */
export async function listOpenOrdersForMatch(
  companyId: string,
  supplierIds?: string[],
): Promise<OpenOrder[]> {
  if (supplierIds && supplierIds.length === 0) return [];
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      supplier_id,
      created_at,
      current_revision:order_revisions!orders_current_revision_fk (
        status,
        delivery_due_date,
        order_revision_items (
          product_id,
          product_name_snapshot,
          requested_quantity,
          agreed_price,
          purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
          pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol )
        )
      ),
      receipts ( id, status, created_at )
    `,
    )
    .eq("company_id", companyId)
    .in("status", ["awaiting_delivery", "partially_received"]);
  if (supplierIds) query = query.in("supplier_id", supplierIds);
  const { data, error } = await query;
  if (error)
    throw new Error(`Falha ao procurar pedidos em aberto: ${error.message}`);

  return (data ?? [])
    .filter((order) => order.current_revision?.status === "confirmed")
    .map((order) => {
      const openReceipt = (order.receipts ?? [])
        .filter((receipt) => receipt.status === "draft")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
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
        openReceiptId: openReceipt?.id ?? null,
      };
    });
}

/**
 * Números de pedido citados no XML (`<xPed>`, no grupo de compra ou em cada
 * item). Só os dígitos, sem zeros à esquerda — "PED-000123" vira "123".
 */
export function purchaseOrderRefsFromXml(xml: string): Set<string> {
  const refs = new Set<string>();
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?xPed>([^<]*)</gi)) {
    const digits = (match[1] ?? "").replace(/\D/g, "").replace(/^0+/, "");
    if (digits) refs.add(digits);
  }
  return refs;
}

type StoredInvoice = InvoiceForMatch & {
  importId: string;
  invoiceNumber: string;
  invoiceSeries: string | null;
  invoiceTotal: number;
  status: string;
};

/** Notas ainda no histórico (rascunho ou conciliada), com os itens. */
async function listStoredInvoices(
  companyId: string,
  supplierIds: string[],
  fromDay: string,
  untilDay?: string,
): Promise<StoredInvoice[]> {
  if (supplierIds.length === 0) return [];
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("historical_nfe_imports")
    .select(
      "id, supplier_id, status, invoice_number, invoice_series, issued_at, invoice_total, historical_nfe_items ( product_id, reconciliation_status, description, commercial_quantity, commercial_unit, practiced_price )",
    )
    .eq("company_id", companyId)
    .in("status", ["draft", "posted"])
    .in("supplier_id", supplierIds)
    .gte("issued_at", `${fromDay}T00:00:00-03:00`);
  if (untilDay)
    query = query.lt("issued_at", `${somarDias(untilDay, 1)}T00:00:00-03:00`);
  const { data, error } = await query.order("issued_at", { ascending: false });
  if (error)
    throw new Error(`Falha ao cruzar notas com pedidos: ${error.message}`);

  return (data ?? []).map((row) => ({
    importId: row.id,
    supplierId: row.supplier_id,
    issuedAt: row.issued_at,
    invoiceNumber: row.invoice_number,
    invoiceSeries: row.invoice_series,
    invoiceTotal: Number(row.invoice_total),
    status: row.status,
    lines: row.historical_nfe_items.map((item) => ({
      productId: item.product_id,
      ignored: item.reconciliation_status === "ignored",
      description: item.description,
      quantity: Number(item.commercial_quantity),
      unit: item.commercial_unit,
      practicedPrice:
        item.practiced_price === null ? null : Number(item.practiced_price),
    })),
  }));
}

/**
 * Notas que já passam pelo critério completo com algum pedido — a aba
 * "Parece pedido" e o selo na lista. O `xPed` fica de fora aqui: lê-lo
 * exigiria baixar o XML de cada nota; a página da nota o considera.
 */
export async function listImportsLookingLikeOrders(
  companyId: string,
): Promise<Map<string, number[]>> {
  const orders = await listOpenOrdersForMatch(companyId);
  const result = new Map<string, number[]>();
  if (orders.length === 0) return result;

  const inicio = orders
    .map((order) => somarDias(order.createdDay, -1))
    .sort()[0];
  const invoices = await listStoredInvoices(
    companyId,
    [...new Set(orders.map((order) => order.supplierId))],
    inicio,
  );
  for (const invoice of invoices) {
    const numeros = orders
      .map((order) => ({
        order,
        evidence: evaluateInvoiceForOrder(invoice, order),
      }))
      .filter(({ evidence }) => evidence?.qualifies)
      .sort((a, b) => b.evidence!.score - a.evidence!.score)
      .map(({ order }) => order.orderNumber);
    if (numeros.length > 0) result.set(invoice.importId, numeros);
  }
  return result;
}

export type InvoiceSuggestion = {
  importId: string;
  invoiceNumber: string;
  invoiceSeries: string | null;
  issuedAt: string;
  invoiceTotal: number;
  status: string;
  evidence: MatchEvidence;
};

/** Notas do histórico que passam pelo critério com este pedido. */
async function invoicesForOrder(
  companyId: string,
  order: OpenOrder,
): Promise<InvoiceSuggestion[]> {
  const invoices = await listStoredInvoices(
    companyId,
    [order.supplierId],
    somarDias(order.createdDay, -1),
    somarDias(
      order.deliveryDueDate ?? order.createdDay,
      JANELA_APOS_PRAZO_DIAS,
    ),
  );
  return invoices
    .flatMap((invoice) => {
      const evidence = evaluateInvoiceForOrder(invoice, order);
      if (!evidence?.qualifies) return [];
      return [
        {
          importId: invoice.importId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceSeries: invoice.invoiceSeries,
          issuedAt: invoice.issuedAt,
          invoiceTotal: invoice.invoiceTotal,
          status: invoice.status,
          evidence,
        },
      ];
    })
    .sort((a, b) => b.evidence.score - a.evidence.score);
}

/**
 * O caminho inverso, para a página do pedido: notas do histórico fiscal que
 * parecem ser dele. A decisão continua na página da nota, onde estão a prévia
 * e o botão de dar entrada — aqui só se aponta para ela.
 */
export async function suggestInvoicesForOrder(
  companyId: string,
  orderId: string,
  supplierId: string,
): Promise<InvoiceSuggestion[]> {
  const order = (await listOpenOrdersForMatch(companyId, [supplierId])).find(
    (candidate) => candidate.id === orderId,
  );
  return order ? invoicesForOrder(companyId, order) : [];
}

/** Uma linha da prévia: o que foi pedido ao lado do que veio nesta nota. */
export type ComparisonRow =
  | {
      kind: "order";
      productName: string;
      requestedQuantity: number;
      purchaseUnit: string;
      agreedPrice: number;
      pricingUnit: string;
      invoice: {
        quantity: number;
        unit: string | null;
        practicedPrice: number | null;
        /** Diferença relativa ao negociado (0,05 = 5% acima). */
        priceDiff: number | null;
      } | null;
    }
  | {
      kind: "extra";
      description: string;
      quantity: number;
      unit: string | null;
    };

function buildComparison(
  invoice: InvoiceForMatch,
  order: OpenOrder,
): ComparisonRow[] {
  const relevant = invoice.lines.filter((line) => !line.ignored);
  const orderProducts = new Set(order.lines.map((line) => line.productId));
  const rows: ComparisonRow[] = order.lines.map((line) => {
    const lines = relevant.filter((item) => item.productId === line.productId);
    if (lines.length === 0) return { kind: "order", ...line, invoice: null };
    // A mesma mercadoria em mais de uma linha da nota (lotes, bonificação)
    // vira uma só: soma a quantidade, e o preço é o da primeira linha cobrada.
    const practicedPrice =
      lines.find((item) => (item.practicedPrice ?? 0) > 0)?.practicedPrice ??
      null;
    return {
      kind: "order",
      ...line,
      invoice: {
        quantity: lines.reduce((sum, item) => sum + item.quantity, 0),
        unit: lines[0].unit,
        practicedPrice,
        priceDiff:
          practicedPrice !== null && line.agreedPrice > 0
            ? practicedPrice / line.agreedPrice - 1
            : null,
      },
    };
  });
  for (const line of relevant) {
    if (line.productId && orderProducts.has(line.productId)) continue;
    rows.push({
      kind: "extra",
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
    });
  }
  return rows;
}

export type OrderSuggestion = {
  orderId: string;
  orderNumber: number;
  deliveryDueDate: string | null;
  createdDay: string;
  /** Já existe chegada aberta: a nota vai para ela em vez de abrir outra. */
  openReceiptId: string | null;
  evidence: MatchEvidence;
  comparison: ComparisonRow[];
  /** Outras notas que passam pelo critério com o mesmo pedido. */
  siblingInvoices: Omit<InvoiceSuggestion, "evidence">[];
};

/**
 * Sugestões para a página de uma nota, com a prévia de cada pedido. Só baixa
 * o XML — para ler o número do pedido escrito nele — quando já existe algum
 * candidato pelo fornecedor e pela data.
 */
export async function suggestOrdersForImport(
  companyId: string,
  history: {
    id: string;
    status: string;
    supplier_id: string | null;
    issued_at: string;
    storage_path: string;
  },
  items: {
    product_id: string | null;
    reconciliation_status: string;
    description: string;
    commercialQuantity: number;
    commercial_unit: string | null;
    practicedPrice: number | null;
  }[],
): Promise<OrderSuggestion[]> {
  if (!["draft", "posted"].includes(history.status) || !history.supplier_id)
    return [];
  const orders = await listOpenOrdersForMatch(companyId, [history.supplier_id]);
  const invoice: InvoiceForMatch = {
    supplierId: history.supplier_id,
    issuedAt: history.issued_at,
    lines: items.map((item) => ({
      productId: item.product_id,
      ignored: item.reconciliation_status === "ignored",
      description: item.description,
      quantity: item.commercialQuantity,
      unit: item.commercial_unit,
      practicedPrice: item.practicedPrice,
    })),
  };
  const candidates = orders.filter((order) =>
    evaluateInvoiceForOrder(invoice, order),
  );
  if (candidates.length === 0) return [];

  const supabase = await createServerSupabaseClient();
  const stored = await supabase.storage
    .from("historical-nfe-documents")
    .download(history.storage_path);
  // Sem o XML a avaliação continua valendo pelos outros sinais.
  if (!stored.error && stored.data) {
    invoice.purchaseOrderRefs = purchaseOrderRefsFromXml(
      await stored.data.text(),
    );
  }

  const qualifying = candidates
    .map((order) => ({
      order,
      evidence: evaluateInvoiceForOrder(invoice, order)!,
    }))
    .filter(({ evidence }) => evidence.qualifies)
    .sort((a, b) => b.evidence.score - a.evidence.score)
    .slice(0, 4);

  return Promise.all(
    qualifying.map(async ({ order, evidence }) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      deliveryDueDate: order.deliveryDueDate,
      createdDay: order.createdDay,
      openReceiptId: order.openReceiptId,
      evidence,
      comparison: buildComparison(invoice, order),
      siblingInvoices: (await invoicesForOrder(companyId, order))
        .filter((sibling) => sibling.importId !== history.id)
        .map((sibling) => ({
          importId: sibling.importId,
          invoiceNumber: sibling.invoiceNumber,
          invoiceSeries: sibling.invoiceSeries,
          issuedAt: sibling.issuedAt,
          invoiceTotal: sibling.invoiceTotal,
          status: sibling.status,
        })),
    })),
  );
}
