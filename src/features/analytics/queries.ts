import "server-only";

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
): Promise<SavingsSummary> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("v_realized_savings")
    .select("negotiated_savings, realized_savings, divergence_impact")
    .eq("company_id", companyId);

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
export async function getSupplierPerformance(
  companyId: string,
): Promise<SupplierPerformance[]> {
  const supabase = await createServerSupabaseClient();

  const [statsRes, suppliersRes] = await Promise.all([
    supabase
      .from("v_supplier_product_stats")
      .select(
        "supplier_id, quotation_opportunities, responses, purchase_orders",
      )
      .eq("company_id", companyId),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId),
  ]);

  if (statsRes.error) {
    throw new Error(`Falha ao carregar desempenho: ${statsRes.error.message}`);
  }
  if (suppliersRes.error) {
    throw new Error(
      `Falha ao carregar fornecedores: ${suppliersRes.error.message}`,
    );
  }

  const nameById = new Map(
    (suppliersRes.data ?? []).map((s) => [s.id, s.name]),
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
};

/**
 * Preço cotado, negociado e realizado, por produto e fornecedor.
 *
 * É o §14.1 do documento: os três momentos do preço lado a lado. A diferença
 * entre cotado e combinado é a negociação; entre combinado e praticado é a
 * divergência.
 */
export async function getPriceHistory(companyId: string): Promise<PriceRow[]> {
  const supabase = await createServerSupabaseClient();

  // Sem embed aqui: view não tem chave estrangeira, e o PostgREST responde
  // PGRST200 ao tentar. Os nomes vêm em consulta própria e o cruzamento é
  // feito em memória — são poucas linhas.
  const { data, error } = await supabase
    .from("v_realized_savings")
    .select(
      "product_id, supplier_id, quoted_price, agreed_price, practiced_price, pricing_quantity_received",
    )
    .eq("company_id", companyId)
    .limit(200);

  if (error) throw new Error(`Falha ao carregar preços: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [products, suppliers] = await Promise.all([
    supabase.from("products").select("id, name").eq("company_id", companyId),
    supabase.from("suppliers").select("id, name").eq("company_id", companyId),
  ]);

  const productName = new Map(
    (products.data ?? []).map((p) => [p.id, p.name]),
  );
  const supplierName = new Map(
    (suppliers.data ?? []).map((s) => [s.id, s.name]),
  );

  return rows.map((row) => ({
    productName: productName.get(row.product_id ?? "") ?? "—",
    supplierName: supplierName.get(row.supplier_id ?? "") ?? "—",
    quoted: row.quoted_price === null ? null : Number(row.quoted_price),
    agreed: Number(row.agreed_price),
    practiced: Number(row.practiced_price),
    quantity: Number(row.pricing_quantity_received),
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
