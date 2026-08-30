import "server-only";

import { getSavingsSummary } from "@/features/analytics/queries";
import type {
  FinancialJourney,
  FinancialJourneyEvent,
  FinancialJourneyMetric,
} from "@/features/dashboard/financial-journey-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Desempenho financeiro do mês — documento mestre, 13.3.
 *
 * O Dashboard mostra situação; a Central de Análises explica comportamento. É
 * por isso que aqui o recorte é fixo no mês corrente e não há filtro nenhum:
 * quem quer cruzar período, categoria e fornecedor vai para Análises, e a
 * página diz isso em vez de duplicar os controles de lá.
 *
 * Os três números de economia vêm da mesma função que alimenta Análises. Duas
 * implementações do mesmo cálculo acabariam divergindo, e economia é
 * exatamente o número que não pode ter duas versões.
 */

export type MonthFinancials = {
  /** Primeiro e último dia do mês, no fuso da empresa. */
  de: string;
  ate: string;
  valorRecebido: number;
  itensRecebidos: number;
  cotacoesConcluidas: number;
  valorPrevistoPedidos: number;
  economiaEstimada: number;
  economiaRealizada: number;
  impactoDivergencias: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Lê o documento congelado ao concluir a cotação. A economia é líquida:
 * reduções de preço somam e aumentos subtraem, sem esconder uma negociação
 * que terminou acima da primeira proposta.
 */
function summarizeCompletedRound(reportData: unknown) {
  const report = record(reportData);
  const summary = record(report?.summary);
  const items = Array.isArray(report?.items) ? report.items : [];

  let economiaEstimada = 0;
  for (const rawItem of items) {
    const item = record(rawItem);
    const offers = Array.isArray(item?.offers) ? item.offers : [];
    for (const rawOffer of offers) {
      const offer = record(rawOffer);
      if (offer?.outcome !== "won") continue;
      const quoted = finiteNumber(offer.quotedPrice);
      const selected = finiteNumber(offer.selectedPrice);
      const quantity = finiteNumber(offer.estimatedPricingQuantity);
      if (quoted !== null && selected !== null && quantity !== null) {
        economiaEstimada += (quoted - selected) * quantity;
      }
    }
  }

  const awarded = finiteNumber(summary?.estimatedAwardedValue);
  return {
    economiaEstimada,
    valorPrevistoPedidos: awarded ?? 0,
  };
}

/**
 * O mês corrente no fuso da empresa.
 *
 * Sem o fuso, a virada do mês aconteceria no horário do servidor: no dia 1º de
 * madrugada, o Brasil ainda estaria no mês anterior e a página mostraria um
 * mês vazio. É a mesma correção que a 0029 fez do lado do banco.
 */
function mesCorrente(timezone: string): { de: string; ate: string } {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  const [ano, mes] = hoje.split("-").map(Number);
  // Dia 0 do mês seguinte é o último dia deste mês.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const prefixo = hoje.slice(0, 7);

  return {
    de: `${prefixo}-01`,
    ate: `${prefixo}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

export async function getMonthFinancials(
  companyId: string,
  timezone: string,
): Promise<MonthFinancials> {
  const { de, ate } = mesCorrente(timezone);
  const supabase = await createServerSupabaseClient();

  const [savings, comprado, snapshots] = await Promise.all([
    getSavingsSummary(companyId, {
      de,
      ate,
      categoriaId: null,
      produtoId: null,
      fornecedorId: null,
      resultadoFinanceiro: null,
      resultadoCotacao: null,
    }),
    // Total comprado sai de `receipt_items`, e não de `v_realized_savings`:
    // aquela view parte da alocação, então pedido direto ficaria de fora — e
    // pedido direto é compra igual às outras.
    supabase
      .from("receipt_items")
      .select(
        "practiced_price, pricing_quantity_received, receipts!inner ( received_at, status )",
      )
      .eq("company_id", companyId)
      .eq("receipts.status", "posted")
      .gte("receipts.received_at", `${de}T00:00:00`)
      .lte("receipts.received_at", `${ate}T23:59:59`),
    supabase
      .from("purchase_round_report_snapshots")
      .select("report_data, purchase_rounds!inner ( completed_at )")
      .eq("company_id", companyId)
      .gte("purchase_rounds.completed_at", `${de}T00:00:00`)
      .lte("purchase_rounds.completed_at", `${ate}T23:59:59`),
  ]);

  if (comprado.error) {
    throw new Error(`Falha ao somar compras: ${comprado.error.message}`);
  }
  if (snapshots.error) {
    throw new Error(
      `Falha ao somar cotações concluídas: ${snapshots.error.message}`,
    );
  }

  const itens = comprado.data ?? [];
  const cotacoes = (snapshots.data ?? []).map((snapshot) =>
    summarizeCompletedRound(snapshot.report_data),
  );

  return {
    de,
    ate,
    valorRecebido: itens.reduce(
      (sum, i) =>
        sum + Number(i.practiced_price) * Number(i.pricing_quantity_received),
      0,
    ),
    itensRecebidos: itens.length,
    cotacoesConcluidas: cotacoes.length,
    valorPrevistoPedidos: cotacoes.reduce(
      (sum, item) => sum + item.valorPrevistoPedidos,
      0,
    ),
    economiaEstimada: cotacoes.reduce(
      (sum, item) => sum + item.economiaEstimada,
      0,
    ),
    economiaRealizada: savings.realized,
    impactoDivergencias: savings.divergenceImpact,
  };
}

/**
 * Memória dos dois resultados realizados do Dashboard.
 *
 * A consulta usa a mesma view, as mesmas colunas e o mesmo recorte de
 * `getSavingsSummary`. A única conta adicional é o saldo acumulado para
 * explicar a evolução; o total continua sendo a soma determinística da view.
 */
export async function getFinancialJourney(
  companyId: string,
  input: { de: string; ate: string; metric: FinancialJourneyMetric },
): Promise<FinancialJourney> {
  const supabase = await createServerSupabaseClient();
  const rows = [];

  for (let start = 0; ; start += 1000) {
    const page = await supabase
      .from("v_realized_savings")
      .select(
        "product_id, supplier_id, quoted_price, agreed_price, practiced_price, pricing_quantity_received, realized_savings, divergence_impact, received_at, order_id, receipt_id",
      )
      .eq("company_id", companyId)
      .gte("received_at", `${input.de}T00:00:00`)
      .lte("received_at", `${input.ate}T23:59:59`)
      .order("received_at", { ascending: true })
      .order("receipt_id", { ascending: true })
      .range(start, start + 999);

    if (page.error) {
      throw new Error(
        `Falha ao carregar memória financeira: ${page.error.message}`,
      );
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  const productIds = [...new Set(rows.flatMap((row) => row.product_id ?? []))];
  const supplierIds = [
    ...new Set(rows.flatMap((row) => row.supplier_id ?? [])),
  ];
  const orderIds = [...new Set(rows.flatMap((row) => row.order_id ?? []))];

  const [products, suppliers, orders] = await Promise.all([
    productIds.length
      ? supabase
          .from("products")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("orders")
          .select("id, order_number")
          .eq("company_id", companyId)
          .in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (products.error || suppliers.error || orders.error) {
    throw new Error(
      `Falha ao identificar os registros da memória: ${products.error?.message ?? suppliers.error?.message ?? orders.error?.message}`,
    );
  }

  const productName = new Map(
    (products.data ?? []).map((row) => [row.id, row.name]),
  );
  const supplierName = new Map(
    (suppliers.data ?? []).map((row) => [row.id, row.name]),
  );
  const orderNumber = new Map(
    (orders.data ?? []).map((row) => [row.id, row.order_number]),
  );
  const grouped = new Map<
    string,
    Omit<FinancialJourneyEvent, "balanceBefore" | "balanceAfter">
  >();

  for (const [index, row] of rows.entries()) {
    const contribution = Number(
      input.metric === "realized"
        ? (row.realized_savings ?? 0)
        : (row.divergence_impact ?? 0),
    );
    const key = row.receipt_id ?? `sem-recebimento-${index}`;
    const current = grouped.get(key) ?? {
      receiptId: row.receipt_id,
      receivedAt: row.received_at ?? `${input.de}T00:00:00`,
      supplierId: row.supplier_id,
      supplierName:
        supplierName.get(row.supplier_id ?? "") ??
        "Fornecedor não identificado",
      orderId: row.order_id,
      orderNumber: orderNumber.get(row.order_id ?? "") ?? null,
      contribution: 0,
      items: [],
    };

    current.contribution += contribution;
    current.items.push({
      productId: row.product_id,
      productName:
        productName.get(row.product_id ?? "") ?? "Produto não identificado",
      quoted: row.quoted_price === null ? null : Number(row.quoted_price),
      agreed: Number(row.agreed_price ?? 0),
      practiced: Number(row.practiced_price ?? 0),
      quantity: Number(row.pricing_quantity_received ?? 0),
      contribution,
    });
    grouped.set(key, current);
  }

  let balance = 0;
  const events: FinancialJourneyEvent[] = [...grouped.values()]
    .sort(
      (a, b) =>
        a.receivedAt.localeCompare(b.receivedAt) ||
        (a.receiptId ?? "").localeCompare(b.receiptId ?? ""),
    )
    .map((event) => {
      const balanceBefore = balance;
      balance += event.contribution;
      return { ...event, balanceBefore, balanceAfter: balance };
    });

  return {
    metric: input.metric,
    de: input.de,
    ate: input.ate,
    total: balance,
    itemCount: rows.length,
    events,
  };
}
