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
 * COMO OS CANDIDATOS SE ORDENAM
 *
 * O número do pedido escrito na própria nota (`xPed`) praticamente decide.
 * Depois pesa quantos produtos do pedido aparecem na nota, e por fim a
 * distância entre a emissão e o prazo.
 */

export const JANELA_APOS_PRAZO_DIAS = 7;

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

export type OpenOrder = {
  id: string;
  orderNumber: number;
  supplierId: string;
  createdDay: string;
  deliveryDueDate: string | null;
  productIds: Set<string>;
  itemCount: number;
  openReceiptId: string | null;
};

export type OrderSuggestion = {
  orderId: string;
  orderNumber: number;
  deliveryDueDate: string | null;
  createdDay: string;
  /** Já existe chegada aberta: a nota vai para ela em vez de abrir outra. */
  openReceiptId: string | null;
  itemCount: number;
  matchedItems: number;
  /** O número do pedido aparece escrito na nota. */
  citedInInvoice: boolean;
  strong: boolean;
  score: number;
};

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
        order_revision_items ( product_id )
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
      const items = order.current_revision?.order_revision_items ?? [];
      const openReceipt = (order.receipts ?? [])
        .filter((receipt) => receipt.status === "draft")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: order.id,
        orderNumber: order.order_number,
        supplierId: order.supplier_id,
        createdDay: diaDaLoja(order.created_at),
        deliveryDueDate: order.current_revision?.delivery_due_date ?? null,
        productIds: new Set(items.map((item) => item.product_id)),
        itemCount: items.length,
        openReceiptId: openReceipt?.id ?? null,
      };
    });
}

/** A nota cabe na janela do pedido? */
function dentroDaJanela(issuedDay: string, order: OpenOrder): boolean {
  const inicio = somarDias(order.createdDay, -1);
  const fim = somarDias(
    order.deliveryDueDate ?? order.createdDay,
    JANELA_APOS_PRAZO_DIAS,
  );
  return issuedDay >= inicio && issuedDay <= fim;
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

/** Candidatos de uma nota, do mais provável ao menos. */
export function rankOrdersForInvoice(
  invoice: {
    supplierId: string | null;
    issuedAt: string;
    productIds: Iterable<string | null>;
    purchaseOrderRefs?: Set<string>;
  },
  orders: OpenOrder[],
): OrderSuggestion[] {
  if (!invoice.supplierId) return [];
  const issuedDay = diaDaLoja(invoice.issuedAt);
  const invoiceProducts = new Set(
    [...invoice.productIds].filter((id): id is string => Boolean(id)),
  );

  return orders
    .filter(
      (order) =>
        order.supplierId === invoice.supplierId &&
        dentroDaJanela(issuedDay, order),
    )
    .map((order) => {
      const matchedItems = [...order.productIds].filter((id) =>
        invoiceProducts.has(id),
      ).length;
      const citedInInvoice =
        invoice.purchaseOrderRefs?.has(String(order.orderNumber)) ?? false;
      const cobertura =
        order.itemCount > 0 ? matchedItems / order.itemCount : 0;
      const referencia = order.deliveryDueDate ?? order.createdDay;
      const proximidade = Math.max(
        0,
        1 - Math.abs(distanciaEmDias(issuedDay, referencia)) / 10,
      );
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryDueDate: order.deliveryDueDate,
        createdDay: order.createdDay,
        openReceiptId: order.openReceiptId,
        itemCount: order.itemCount,
        matchedItems,
        citedInInvoice,
        strong: citedInInvoice || cobertura >= 0.5,
        score: (citedInInvoice ? 100 : 0) + cobertura * 60 + proximidade * 20,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Notas ainda no histórico (rascunho ou conciliada) que têm ao menos um
 * pedido candidato — a aba "Parece pedido" e o selo na lista.
 *
 * Aqui só valem fornecedor e janela de datas: olhar os itens de cada nota
 * custaria uma consulta por importação. A página da nota mostra a evidência
 * completa antes de qualquer decisão.
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
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("historical_nfe_imports")
    .select("id, supplier_id, issued_at")
    .eq("company_id", companyId)
    .in("status", ["draft", "posted"])
    .in("supplier_id", [...new Set(orders.map((order) => order.supplierId))])
    .gte("issued_at", `${inicio}T00:00:00-03:00`);
  if (error)
    throw new Error(`Falha ao cruzar notas com pedidos: ${error.message}`);

  for (const row of data ?? []) {
    if (!row.supplier_id) continue;
    const issuedDay = diaDaLoja(row.issued_at);
    const numeros = orders
      .filter(
        (order) =>
          order.supplierId === row.supplier_id &&
          dentroDaJanela(issuedDay, order),
      )
      .map((order) => order.orderNumber);
    if (numeros.length > 0) result.set(row.id, numeros);
  }
  return result;
}

/**
 * Sugestões para a página de uma nota. Só baixa o XML — para ler o número do
 * pedido escrito nele — quando já existe algum candidato pelo fornecedor e
 * pela data.
 */
export async function suggestOrdersForImport(
  companyId: string,
  history: {
    status: string;
    supplier_id: string | null;
    issued_at: string;
    storage_path: string;
  },
  items: { product_id: string | null }[],
): Promise<OrderSuggestion[]> {
  if (!["draft", "posted"].includes(history.status) || !history.supplier_id)
    return [];
  const orders = await listOpenOrdersForMatch(companyId, [history.supplier_id]);
  const invoice = {
    supplierId: history.supplier_id,
    issuedAt: history.issued_at,
    productIds: items.map((item) => item.product_id),
  };
  const candidates = rankOrdersForInvoice(invoice, orders);
  if (candidates.length === 0) return [];

  const supabase = await createServerSupabaseClient();
  const stored = await supabase.storage
    .from("historical-nfe-documents")
    .download(history.storage_path);
  // Sem o XML a sugestão continua valendo pelos outros sinais.
  if (stored.error || !stored.data) return candidates;
  return rankOrdersForInvoice(
    {
      ...invoice,
      purchaseOrderRefs: purchaseOrderRefsFromXml(await stored.data.text()),
    },
    orders,
  );
}
