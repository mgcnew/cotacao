import "server-only";

import { getSavingsSummary } from "@/features/analytics/queries";
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
