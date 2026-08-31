import "server-only";

import {
  getAnalyticsReferences,
  resolveProductIds,
  type AnalyticsFilters,
} from "@/features/analytics/filters";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Central de Análises.
 *
 * Todo número aqui sai de view do banco, não de conta feita no TypeScript. O
 * documento mestre é explícito: "a IA interpretará dados; cálculos
 * fundamentais continuarão determinísticos". Somar em JavaScript o que a view
 * já calcula seria criar uma segunda verdade.
 *
 * A base é `v_realized_savings`, que separa três coisas que costumam ser
 * confundidas:
 *  - economia negociada: o que a negociação prometeu (cotado − combinado);
 *  - economia realizada: o que de fato entrou (cotado − praticado);
 *  - impacto de divergência: o que a nota cobrou a mais (praticado − combinado).
 *  - escolha de embalagem: vantagem unitária contra a melhor alternativa,
 *    somente para produtos com finalidade `packaging`.
 */

/**
 * Aplica o recorte comum às consultas de v_realized_savings.
 *
 * `ate` recebe um dia inteiro: o usuário escolhe 31/08 esperando incluir o
 * dia 31, não parar à meia-noite do dia 30.
 */
// Os builders do PostgREST preservam o tipo da consulta a cada operador. A
// assinatura estrutural abaixo aceita consultas de view, count e range sem
// apagar o tipo do resultado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends Record<string, any>>(
  query: T,
  filters: AnalyticsFilters | undefined,
  productIds: string[] | null,
): T {
  if (!filters) return query;

  let q = query;
  if (filters.de) q = q.gte("received_at", `${filters.de}T00:00:00`);
  if (filters.ate) q = q.lte("received_at", `${filters.ate}T23:59:59`);
  if (filters.fornecedorId) q = q.eq("supplier_id", filters.fornecedorId);
  if (productIds !== null) q = q.in("product_id", productIds);
  switch (filters.resultadoFinanceiro) {
    case "economia":
      q = q.gt("realized_savings", 0);
      break;
    case "acrescimo":
      q = q.lt("realized_savings", 0);
      break;
    case "divergencia":
      q = q.neq("divergence_impact", 0);
      break;
    case "sem_alteracao":
      q = q.eq("realized_savings", 0).eq("divergence_impact", 0);
      break;
    case "sem_referencia":
      q = q.is("quoted_price", null);
      break;
  }
  return q;
}

export type SavingsSummary = {
  negotiated: number;
  realized: number;
  divergenceImpact: number;
  packagingChoice: number;
  /** Quanto da economia negociada sobreviveu até a nota fiscal. */
  captureRate: number | null;
  itemCount: number;
  economyItems: number;
  costItems: number;
  divergentItems: number;
  packagingChoiceItems: number;
};

export async function getSavingsSummary(
  companyId: string,
  filters?: AnalyticsFilters,
): Promise<SavingsSummary> {
  const supabase = await createServerSupabaseClient();

  const productIds = filters
    ? await resolveProductIds(companyId, filters)
    : null;
  // Lista vazia significa "o recorte não casou com produto algum" — resultado
  // zerado, e não filtro ignorado.
  if (productIds !== null && productIds.length === 0) {
    return {
      negotiated: 0,
      realized: 0,
      divergenceImpact: 0,
      packagingChoice: 0,
      captureRate: null,
      itemCount: 0,
      economyItems: 0,
      costItems: 0,
      divergentItems: 0,
      packagingChoiceItems: 0,
    };
  }

  const rows = [];
  for (let start = 0; ; start += 1000) {
    let query = supabase
      .from("v_realized_savings")
      .select(
        "negotiated_savings, realized_savings, divergence_impact, packaging_choice_result, quoted_price",
      )
      .eq("company_id", companyId);
    query = applyFilters(query, filters, productIds);
    const page = await query.range(start, start + 999);
    if (page.error) {
      throw new Error(`Falha ao carregar economia: ${page.error.message}`);
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const negotiated = rows.reduce(
    (s, r) => s + Number(r.negotiated_savings ?? 0),
    0,
  );
  const realized = rows.reduce(
    (s, r) => s + Number(r.realized_savings ?? 0),
    0,
  );
  const divergenceImpact = rows.reduce(
    (s, r) => s + Number(r.divergence_impact ?? 0),
    0,
  );
  const packagingChoice = rows.reduce(
    (s, r) => s + Number(r.packaging_choice_result ?? 0),
    0,
  );

  return {
    negotiated,
    realized,
    divergenceImpact,
    packagingChoice,
    // Sem economia negociada não existe taxa de captura — dividir por zero
    // produziria um número que parece informação e não é.
    captureRate: negotiated > 0 ? realized / negotiated : null,
    itemCount: rows.length,
    economyItems: rows.filter((row) => Number(row.realized_savings) > 0).length,
    costItems: rows.filter((row) => Number(row.realized_savings) < 0).length,
    divergentItems: rows.filter((row) => Number(row.divergence_impact) !== 0)
      .length,
    packagingChoiceItems: rows.filter(
      (row) => Number(row.packaging_choice_result ?? 0) > 0,
    ).length,
  };
}

export type ReceiptSummary = {
  total: number;
  items: number;
  receipts: number;
  orders: number;
};

/** Compras efetivamente conferidas, inclusive pedidos feitos sem cotação. */
export async function getReceiptSummary(
  companyId: string,
  filters?: AnalyticsFilters,
): Promise<ReceiptSummary> {
  const supabase = await createServerSupabaseClient();
  const productIds = filters
    ? await resolveProductIds(companyId, filters)
    : null;
  if (productIds !== null && productIds.length === 0) {
    return { total: 0, items: 0, receipts: 0, orders: 0 };
  }

  const rows = [];
  for (let start = 0; ; start += 1000) {
    let query = supabase
      .from("receipt_items")
      .select(
        `
        receipt_id, practiced_price, pricing_quantity_received,
        receipts!inner (
          received_at, status, order_id,
          orders!inner ( supplier_id )
        ),
        order_revision_items!inner ( product_id )
      `,
      )
      .eq("company_id", companyId)
      .eq("receipts.status", "posted");

    if (filters?.de) {
      query = query.gte("receipts.received_at", `${filters.de}T00:00:00`);
    }
    if (filters?.ate) {
      query = query.lte("receipts.received_at", `${filters.ate}T23:59:59`);
    }
    if (filters?.fornecedorId) {
      query = query.eq("receipts.orders.supplier_id", filters.fornecedorId);
    }
    if (productIds !== null) {
      query = query.in("order_revision_items.product_id", productIds);
    }

    const page = await query.range(start, start + 999);
    if (page.error) {
      throw new Error(`Falha ao resumir recebimentos: ${page.error.message}`);
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return {
    total: rows.reduce(
      (sum, row) =>
        sum +
        Number(row.practiced_price) * Number(row.pricing_quantity_received),
      0,
    ),
    items: rows.length,
    receipts: new Set(rows.map((row) => row.receipt_id)).size,
    orders: new Set(rows.map((row) => row.receipts.order_id)).size,
  };
}

export type SupplierPerformance = {
  supplierId: string;
  supplierName: string;
  opportunities: number;
  responses: number;
  responseRate: number | null;
  purchaseOrders: number;
  wins: number;
  losses: number;
  noResponses: number;
  unavailable: number;
  winRate: number | null;
  lastRoundAt: string | null;
};

export type SupplierPerformanceResult = {
  rows: SupplierPerformance[];
  /** Fallback usado apenas enquanto a migration da agregação não foi aplicada. */
  lifetimeFallback: boolean;
};

/** Desempenho por fornecedor, agregando o par fornecedor × produto. */
/**
 * Desempenho por fornecedor.
 *
 * Usa o histórico de cotação, portanto período, produto, categoria,
 * fornecedor e resultado são aplicados de verdade à mesma base.
 */
export async function getSupplierPerformance(
  companyId: string,
  filters?: AnalyticsFilters,
): Promise<SupplierPerformanceResult> {
  const supabase = await createServerSupabaseClient();

  const productIds = filters
    ? await resolveProductIds(companyId, filters)
    : null;
  if (productIds !== null && productIds.length === 0) {
    return { rows: [], lifetimeFallback: false };
  }

  const result = await supabase.rpc("rpc_analytics_supplier_performance", {
    p_company_id: companyId,
    p_from: filters?.de ?? undefined,
    p_to: filters?.ate ?? undefined,
    p_product_ids: productIds ?? undefined,
    p_supplier_id: filters?.fornecedorId ?? undefined,
    p_outcome: filters?.resultadoCotacao ?? undefined,
  });

  if (!result.error) {
    return {
      lifetimeFallback: false,
      rows: (result.data ?? []).map((row) => {
        const opportunities = Number(row.opportunities);
        const responses = Number(row.responses);
        const wins = Number(row.wins);
        const losses = Number(row.losses);
        return {
          supplierId: row.supplier_id,
          supplierName: row.supplier_name,
          opportunities,
          responses,
          responseRate: opportunities > 0 ? responses / opportunities : null,
          purchaseOrders: Number(row.purchase_orders),
          wins,
          losses,
          noResponses: Number(row.no_responses),
          unavailable: Number(row.unavailable),
          winRate: wins + losses > 0 ? wins / (wins + losses) : null,
          lastRoundAt: row.last_round_at,
        };
      }),
    };
  }

  // Mantém a tela disponível no intervalo entre deploy e aplicação da
  // migration 0063. Esta view é leve, porém não possui data nem desfecho.
  let fallback = supabase
    .from("v_supplier_product_stats")
    .select(
      "supplier_id, quotation_opportunities, responses, purchase_orders, last_response_at, last_purchase_at",
    )
    .eq("company_id", companyId);
  if (filters?.fornecedorId) {
    fallback = fallback.eq("supplier_id", filters.fornecedorId);
  }
  if (productIds !== null) fallback = fallback.in("product_id", productIds);
  const fallbackResult = await fallback;
  if (fallbackResult.error) {
    throw new Error(
      `Falha ao carregar desempenho: ${fallbackResult.error.message || result.error.message}`,
    );
  }

  const references = await getAnalyticsReferences(companyId);
  const nameById = new Map(
    references.fornecedores.map((supplier) => [supplier.id, supplier.name]),
  );
  const grouped = new Map<string, SupplierPerformance>();
  for (const row of fallbackResult.data ?? []) {
    if (!row.supplier_id) continue;
    const current = grouped.get(row.supplier_id) ?? {
      supplierId: row.supplier_id,
      supplierName: nameById.get(row.supplier_id) ?? "—",
      opportunities: 0,
      responses: 0,
      responseRate: null,
      purchaseOrders: 0,
      wins: 0,
      losses: 0,
      noResponses: 0,
      unavailable: 0,
      winRate: null,
      lastRoundAt: null,
    };
    current.opportunities += Number(row.quotation_opportunities ?? 0);
    current.responses += Number(row.responses ?? 0);
    current.purchaseOrders += Number(row.purchase_orders ?? 0);
    const activity = [row.last_response_at, row.last_purchase_at]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    if (activity && (!current.lastRoundAt || activity > current.lastRoundAt)) {
      current.lastRoundAt = activity;
    }
    grouped.set(row.supplier_id, current);
  }

  return {
    lifetimeFallback: true,
    rows: [...grouped.values()]
      .map((supplier) => ({
        ...supplier,
        noResponses: Math.max(supplier.opportunities - supplier.responses, 0),
        responseRate:
          supplier.opportunities > 0
            ? supplier.responses / supplier.opportunities
            : null,
      }))
      .sort((a, b) => b.opportunities - a.opportunities),
  };
}

export type PriceRow = {
  productName: string;
  supplierName: string;
  quoted: number | null;
  agreed: number;
  practiced: number;
  quantity: number;
  receivedAt: string | null;
  negotiatedResult: number | null;
  realizedResult: number | null;
  divergence: number;
  orderId: string | null;
  receiptId: string | null;
};

export type AnalyticsPagination = { page: number; pageSize: number };

/**
 * Preço cotado, negociado e realizado, por produto e fornecedor.
 *
 * É o §14.1 do documento: os três momentos do preço lado a lado. A diferença
 * entre cotado e combinado é a negociação; entre combinado e praticado é a
 * divergência.
 */
export async function getPriceHistory(
  companyId: string,
  filters?: AnalyticsFilters,
  pagination: AnalyticsPagination = { page: 1, pageSize: 10 },
) {
  const supabase = await createServerSupabaseClient();

  const productIds = filters
    ? await resolveProductIds(companyId, filters)
    : null;
  if (productIds !== null && productIds.length === 0) {
    return {
      rows: [] as PriceRow[],
      total: 0,
      page: 1,
      pageSize: pagination.pageSize,
    };
  }

  // Sem embed aqui: view não tem chave estrangeira, e o PostgREST responde
  // PGRST200 ao tentar. Os nomes vêm em consulta própria e o cruzamento é
  // feito em memória — são poucas linhas.
  let countQuery = supabase
    .from("v_realized_savings")
    .select("receipt_id", { count: "exact", head: true })
    .eq("company_id", companyId);
  countQuery = applyFilters(countQuery, filters, productIds);
  const countResult = await countQuery;
  if (countResult.error) {
    throw new Error(`Falha ao contar preços: ${countResult.error.message}`);
  }
  const total = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const page = Math.min(Math.max(pagination.page, 1), totalPages);
  const start = (page - 1) * pagination.pageSize;

  let query = supabase
    .from("v_realized_savings")
    .select(
      "product_id, supplier_id, quoted_price, agreed_price, practiced_price, pricing_quantity_received, negotiated_savings, realized_savings, divergence_impact, received_at, order_id, receipt_id",
    )
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .range(start, start + pagination.pageSize - 1);

  query = applyFilters(query, filters, productIds);

  const { data, error } = await query;

  if (error) throw new Error(`Falha ao carregar preços: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      rows: [] as PriceRow[],
      total,
      page,
      pageSize: pagination.pageSize,
    };
  }

  const references = await getAnalyticsReferences(companyId);

  const productName = new Map(references.produtos.map((p) => [p.id, p.name]));
  const supplierName = new Map(
    references.fornecedores.map((s) => [s.id, s.name]),
  );

  return {
    rows: rows.map((row) => ({
      productName: productName.get(row.product_id ?? "") ?? "—",
      supplierName: supplierName.get(row.supplier_id ?? "") ?? "—",
      quoted: row.quoted_price === null ? null : Number(row.quoted_price),
      agreed: Number(row.agreed_price),
      practiced: Number(row.practiced_price),
      quantity: Number(row.pricing_quantity_received),
      receivedAt: row.received_at,
      negotiatedResult:
        row.negotiated_savings === null ? null : Number(row.negotiated_savings),
      realizedResult:
        row.realized_savings === null ? null : Number(row.realized_savings),
      divergence: Number(row.divergence_impact ?? 0),
      orderId: row.order_id,
      receiptId: row.receipt_id,
    })),
    total,
    page,
    pageSize: pagination.pageSize,
  };
}

/** Contagens que dizem se já existe base para analisar. */
export async function getAnalyticsCoverage(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const [rounds, responses, orders, receipts] = await Promise.all([
    supabase
      .from("purchase_rounds")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("quotation_response_items")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "posted"),
  ]);

  return {
    rounds: rounds.count ?? 0,
    responses: responses.count ?? 0,
    orders: orders.count ?? 0,
    receipts: receipts.count ?? 0,
  };
}
