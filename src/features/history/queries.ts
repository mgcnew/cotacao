import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { PriceHistoryPoint } from "@/components/history/price-history-chart";

export const HISTORY_OUTCOMES = [
  "won",
  "lost",
  "no_response",
  "unavailable",
  "closed_without_purchase",
  "cancelled",
  "in_progress",
  "no_price",
] as const;

export type HistoryOutcome = (typeof HISTORY_OUTCOMES)[number];

export const HISTORY_OUTCOME_LABEL: Record<HistoryOutcome, string> = {
  won: "Ganhou",
  lost: "Não ganhou",
  no_response: "Não respondeu",
  unavailable: "Não fornece",
  closed_without_purchase: "Encerrado sem compra",
  cancelled: "Cancelado",
  in_progress: "Em andamento",
  no_price: "Sem preço",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export type HistoryFilters = {
  from: string | null;
  to: string | null;
  outcome: HistoryOutcome | null;
  relatedId: string | null;
  page: number;
  pageSize: number;
};

export function parseHistoryFilters(
  params: SearchParams,
  relatedKey: "fornecedor" | "produto",
): HistoryFilters {
  const rawOutcome = first(params.resultado);
  const rawRelated = first(params[relatedKey]);
  const rawPage = Number(first(params.pagina));
  const rawPageSize = Number(first(params.por_pagina));

  return {
    from: validDate(first(params.de)),
    to: validDate(first(params.ate)),
    outcome: HISTORY_OUTCOMES.includes(rawOutcome as HistoryOutcome)
      ? (rawOutcome as HistoryOutcome)
      : null,
    relatedId:
      rawRelated &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawRelated,
      )
        ? rawRelated
        : null,
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: [10, 20, 30].includes(rawPageSize) ? rawPageSize : 10,
  };
}

type HistoryView = Database["public"]["Views"]["v_quotation_history"]["Row"];

export type QuotationHistoryRow = HistoryView & {
  outcome: HistoryOutcome;
};

export type HistorySummary = {
  rounds: number;
  opportunities: number;
  responses: number;
  wins: number;
  losses: number;
  noResponses: number;
  orders: number;
  minPrice: number | null;
  maxPrice: number | null;
  averagePrice: number | null;
  lastPrice: number | null;
};

type HistoryScope =
  | { productId: string }
  | { supplierId: string };

function applyHistoryFilters<T extends {
  gte: (column: string, value: string) => T;
  lt: (column: string, value: string) => T;
  eq: (column: string, value: string) => T;
}>(query: T, filters: HistoryFilters, relatedColumn: string): T {
  let next = query;
  if (filters.from) next = next.gte("round_created_at", filters.from);
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    next = next.lt("round_created_at", end.toISOString());
  }
  if (filters.outcome) next = next.eq("outcome", filters.outcome);
  if (filters.relatedId) next = next.eq(relatedColumn, filters.relatedId);
  return next;
}

export async function getQuotationHistory(
  companyId: string,
  scope: HistoryScope,
  filters: HistoryFilters,
) {
  const supabase = await createServerSupabaseClient();
  const scopeColumn = "productId" in scope ? "product_id" : "supplier_id";
  const scopeId = "productId" in scope ? scope.productId : scope.supplierId;
  const relatedColumn = "productId" in scope ? "supplier_id" : "product_id";

  let countQuery = supabase
    .from("v_quotation_history")
    .select("quotation_item_id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq(scopeColumn, scopeId);
  countQuery = applyHistoryFilters(countQuery, filters, relatedColumn);

  const summaryArgs: Database["public"]["Functions"]["rpc_quotation_history_summary"]["Args"] = {
    p_company_id: companyId,
  };
  if ("productId" in scope) summaryArgs.p_product_id = scope.productId;
  else summaryArgs.p_supplier_id = scope.supplierId;
  if (filters.relatedId) {
    if ("productId" in scope) summaryArgs.p_supplier_id = filters.relatedId;
    else summaryArgs.p_product_id = filters.relatedId;
  }
  if (filters.from) summaryArgs.p_from = filters.from;
  if (filters.to) summaryArgs.p_to = filters.to;

  const optionsQuery = supabase
    .from("v_quotation_history")
    .select(
      "product_id, product_name, supplier_id, supplier_name, round_created_at",
    )
    .eq("company_id", companyId)
    .eq(scopeColumn, scopeId)
    .order("round_created_at", { ascending: false })
    .limit(1000);

  const [countResult, summaryResult, optionsResult] = await Promise.all([
    countQuery,
    supabase.rpc("rpc_quotation_history_summary", summaryArgs),
    optionsQuery,
  ]);

  if (countResult.error) {
    throw new Error(`Falha ao contar o histórico: ${countResult.error.message}`);
  }
  if (summaryResult.error) {
    throw new Error(`Falha ao resumir o histórico: ${summaryResult.error.message}`);
  }
  if (optionsResult.error) {
    throw new Error(`Falha ao listar filtros do histórico: ${optionsResult.error.message}`);
  }

  const total = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;

  let rowsQuery = supabase
    .from("v_quotation_history")
    .select("*")
    .eq("company_id", companyId)
    .eq(scopeColumn, scopeId)
    .order("round_created_at", { ascending: false })
    .order("supplier_name")
    .range(start, start + filters.pageSize - 1);
  rowsQuery = applyHistoryFilters(rowsQuery, filters, relatedColumn);
  const rowsResult = await rowsQuery;

  if (rowsResult.error) {
    throw new Error(`Falha ao carregar o histórico: ${rowsResult.error.message}`);
  }

  const rawSummary = summaryResult.data?.[0];
  const numberOrNull = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value);
  const summary: HistorySummary = {
    rounds: Number(rawSummary?.rounds ?? 0),
    opportunities: Number(rawSummary?.opportunities ?? 0),
    responses: Number(rawSummary?.responses ?? 0),
    wins: Number(rawSummary?.wins ?? 0),
    losses: Number(rawSummary?.losses ?? 0),
    noResponses: Number(rawSummary?.no_responses ?? 0),
    orders: Number(rawSummary?.orders ?? 0),
    minPrice: numberOrNull(rawSummary?.min_price),
    maxPrice: numberOrNull(rawSummary?.max_price),
    averagePrice: numberOrNull(rawSummary?.average_price),
    lastPrice: numberOrNull(rawSummary?.last_price),
  };

  const optionMap = new Map<string, string>();
  for (const row of optionsResult.data ?? []) {
    const id = "productId" in scope ? row.supplier_id : row.product_id;
    const name = "productId" in scope ? row.supplier_name : row.product_name;
    if (id && name) optionMap.set(id, name);
  }

  let pricePoints: PriceHistoryPoint[] = [];
  if ("productId" in scope) {
    let chartQuery = supabase
      .from("v_quotation_history")
      .select("round_created_at, submitted_at, supplier_name, current_price")
      .eq("company_id", companyId)
      .eq("product_id", scope.productId)
      .not("current_price", "is", null)
      .order("round_created_at", { ascending: true })
      .limit(200);
    chartQuery = applyHistoryFilters(chartQuery, filters, "supplier_id");
    const chartResult = await chartQuery;
    if (chartResult.error) {
      throw new Error(
        `Falha ao carregar a evolução de preços: ${chartResult.error.message}`,
      );
    }
    pricePoints = (chartResult.data ?? []).flatMap((row) =>
      row.current_price !== null && row.round_created_at && row.supplier_name
        ? [
            {
              date: row.submitted_at ?? row.round_created_at,
              supplier: row.supplier_name,
              price: Number(row.current_price),
            },
          ]
        : [],
    );
  }

  return {
    rows: (rowsResult.data ?? []).filter(
      (row): row is QuotationHistoryRow =>
        HISTORY_OUTCOMES.includes(row.outcome as HistoryOutcome),
    ),
    summary,
    pricePoints,
    options: [...optionMap].map(([id, name]) => ({ id, name })),
    pagination: { page, pageSize: filters.pageSize, total },
  };
}
