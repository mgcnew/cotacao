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
 */

/**
 * Aplica o recorte comum às consultas de v_realized_savings.
 *
 * `ate` recebe um dia inteiro: o usuário escolhe 31/08 esperando incluir o
 * dia 31, não parar à meia-noite do dia 30.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends { gte: any; lte: any; eq: any; in: any }>(
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
  return q;
}

export type SavingsSummary = {
  negotiated: number;
  realized: number;
  divergenceImpact: number;
  /** Quanto da economia negociada sobreviveu até a nota fiscal. */
  captureRate: number | null;
  itemCount: number;
};

export async function getSavingsSummary(
  companyId: string,
  filters?: AnalyticsFilters,
): Promise<SavingsSummary> {
  const supabase = await createServerSupabaseClient();

  const productIds = filters ? await resolveProductIds(companyId, filters) : null;
  // Lista vazia significa "o recorte não casou com produto algum" — resultado
  // zerado, e não filtro ignorado.
  if (productIds !== null && productIds.length === 0) {
    return {
      negotiated: 0,
      realized: 0,
      divergenceImpact: 0,
      captureRate: null,
      itemCount: 0,
    };
  }

  let query = supabase
    .from("v_realized_savings")
    .select("negotiated_savings, realized_savings, divergence_impact")
    .eq("company_id", companyId);

  query = applyFilters(query, filters, productIds);

  const { data, error } = await query;

  if (error) throw new Error(`Falha ao carregar economia: ${error.message}`);

  const rows = data ?? [];
  const negotiated = rows.reduce(
    (s, r) => s + Number(r.negotiated_savings ?? 0),
    0,
  );
  const realized = rows.reduce((s, r) => s + Number(r.realized_savings ?? 0), 0);
  const divergenceImpact = rows.reduce(
    (s, r) => s + Number(r.divergence_impact ?? 0),
    0,
  );

  return {
    negotiated,
    realized,
    divergenceImpact,
    // Sem economia negociada não existe taxa de captura — dividir por zero
    // produziria um número que parece informação e não é.
    captureRate: negotiated > 0 ? realized / negotiated : null,
    itemCount: rows.length,
  };
}

export type SupplierPerformance = {
  supplierId: string;
  supplierName: string;
  opportunities: number;
  responses: number;
  responseRate: number | null;
  purchaseOrders: number;
};

/** Desempenho por fornecedor, agregando o par fornecedor × produto. */
/**
 * Desempenho por fornecedor.
 *
 * `v_supplier_product_stats` não tem data, então o recorte de PERÍODO não se
 * aplica aqui — a tela avisa isso em vez de fingir que aplicou. Categoria,
 * produto e fornecedor valem normalmente.
 */
export async function getSupplierPerformance(
  companyId: string,
  filters?: AnalyticsFilters,
): Promise<SupplierPerformance[]> {
  const supabase = await createServerSupabaseClient();

  const productIds = filters ? await resolveProductIds(companyId, filters) : null;
  if (productIds !== null && productIds.length === 0) return [];

  let statsQuery = supabase
    .from("v_supplier_product_stats")
    .select("supplier_id, quotation_opportunities, responses, purchase_orders")
    .eq("company_id", companyId);

  if (filters?.fornecedorId) {
    statsQuery = statsQuery.eq("supplier_id", filters.fornecedorId);
  }
  if (productIds !== null) {
    statsQuery = statsQuery.in("product_id", productIds);
  }

  const [statsRes, references] = await Promise.all([
    statsQuery,
    getAnalyticsReferences(companyId),
  ]);

  if (statsRes.error) {
    throw new Error(`Falha ao carregar desempenho: ${statsRes.error.message}`);
  }

  const nameById = new Map(
    references.fornecedores.map((s) => [s.id, s.name]),
  );
  const acc = new Map<string, SupplierPerformance>();

  for (const row of statsRes.data ?? []) {
    // Colunas de view chegam anuláveis no tipo gerado, mesmo quando a
    // consulta nunca produz null. O guarda deixa isso explícito.
    const supplierId = row.supplier_id;
    if (!supplierId) continue;

    const current = acc.get(supplierId) ?? {
      supplierId,
      supplierName: nameById.get(supplierId) ?? "—",
      opportunities: 0,
      responses: 0,
      responseRate: null,
      purchaseOrders: 0,
    };

    current.opportunities += row.quotation_opportunities ?? 0;
    current.responses += row.responses ?? 0;
    current.purchaseOrders += row.purchase_orders ?? 0;
    acc.set(supplierId, current);
  }

  return [...acc.values()]
    .map((s) => ({
      ...s,
      responseRate:
        s.opportunities > 0 ? s.responses / s.opportunities : null,
    }))
    .sort((a, b) => b.opportunities - a.opportunities);
}

export type PriceRow = {
  productName: string;
  supplierName: string;
  quoted: number | null;
  agreed: number;
  practiced: number;
  quantity: number;
  receivedAt: string | null;
};

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
): Promise<PriceRow[]> {
  const supabase = await createServerSupabaseClient();

  const productIds = filters ? await resolveProductIds(companyId, filters) : null;
  if (productIds !== null && productIds.length === 0) return [];

  // Sem embed aqui: view não tem chave estrangeira, e o PostgREST responde
  // PGRST200 ao tentar. Os nomes vêm em consulta própria e o cruzamento é
  // feito em memória — são poucas linhas.
  let query = supabase
    .from("v_realized_savings")
    .select(
      "product_id, supplier_id, quoted_price, agreed_price, practiced_price, pricing_quantity_received, received_at",
    )
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(200);

  query = applyFilters(query, filters, productIds);

  const { data, error } = await query;

  if (error) throw new Error(`Falha ao carregar preços: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const references = await getAnalyticsReferences(companyId);

  const productName = new Map(
    references.produtos.map((p) => [p.id, p.name]),
  );
  const supplierName = new Map(
    references.fornecedores.map((s) => [s.id, s.name]),
  );

  return rows.map((row) => ({
    productName: productName.get(row.product_id ?? "") ?? "—",
    supplierName: supplierName.get(row.supplier_id ?? "") ?? "—",
    quoted: row.quoted_price === null ? null : Number(row.quoted_price),
    agreed: Number(row.agreed_price),
    practiced: Number(row.practiced_price),
    quantity: Number(row.pricing_quantity_received),
    receivedAt: row.received_at,
  }));
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
