import "server-only";

import type { PriceHistoryPoint } from "@/components/history/price-history-chart";
import type { HistoryFilters } from "@/features/history/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export async function listHistoricalNfeImports(
  companyId: string,
  requestedPage = 1,
) {
  const supabase = await createServerSupabaseClient();
  const pageSize = 30;
  const count = await supabase
    .from("historical_nfe_imports")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (count.error)
    throw new Error(`Falha ao contar NF-e: ${count.error.message}`);
  const total = count.count ?? 0;
  const page = Math.min(
    Math.max(requestedPage, 1),
    Math.max(Math.ceil(total / pageSize), 1),
  );
  const start = (page - 1) * pageSize;
  const [imports, suppliers] = await Promise.all([
    supabase
      .from("historical_nfe_imports")
      .select(
        "id, supplier_id, status, access_key, invoice_number, invoice_series, issued_at, issuer_name, invoice_total, file_name, created_at, historical_nfe_items(count)",
      )
      .eq("company_id", companyId)
      .order("issued_at", { ascending: false })
      .range(start, start + pageSize - 1),
    supabase.from("suppliers").select("id, name").eq("company_id", companyId),
  ]);
  if (imports.error)
    throw new Error(`Falha ao listar NF-e: ${imports.error.message}`);
  if (suppliers.error)
    throw new Error(`Falha ao listar fornecedores: ${suppliers.error.message}`);
  const supplierNames = new Map(
    (suppliers.data ?? []).map((row) => [row.id, row.name]),
  );
  return {
    rows: (imports.data ?? []).map((row) => ({
      ...row,
      supplierName: row.supplier_id
        ? (supplierNames.get(row.supplier_id) ?? null)
        : null,
      itemCount: row.historical_nfe_items[0]?.count ?? 0,
      invoiceTotal: Number(row.invoice_total),
    })),
    pagination: { page, pageSize, total },
  };
}

/**
 * Catálogo completo usado pelos seletores da conciliação. Sem paginação, o
 * limite padrão de 1.000 linhas do PostgREST oculta silenciosamente produtos.
 */
async function listHistoricalReconciliationProducts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
) {
  const data = [];
  for (let start = 0; ; start += 1000) {
    const page = await supabase
      .from("products")
      .select(
        `
          id, name, is_active,
          pricing_unit_id,
          pricing_unit:units!products_company_id_pricing_unit_id_fkey ( code, symbol )
        `,
      )
      .eq("company_id", companyId)
      .order("name")
      .order("id")
      .range(start, start + 999);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { data, error: null };
}

export async function getHistoricalNfeImport(
  companyId: string,
  importId: string,
) {
  const supabase = await createServerSupabaseClient();
  const [history, items, suppliers, products] = await Promise.all([
    supabase
      .from("historical_nfe_imports")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", importId)
      .maybeSingle(),
    supabase
      .from("historical_nfe_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("import_id", importId)
      .order("line_number"),
    supabase
      .from("suppliers")
      .select("id, name, legal_name, document_number, status")
      .eq("company_id", companyId)
      .order("name"),
    listHistoricalReconciliationProducts(supabase, companyId),
  ]);
  if (history.error)
    throw new Error(`Falha ao abrir NF-e: ${history.error.message}`);
  if (!history.data) return null;
  if (items.error)
    throw new Error(`Falha ao listar itens da NF-e: ${items.error.message}`);
  if (suppliers.error)
    throw new Error(`Falha ao listar fornecedores: ${suppliers.error.message}`);
  if (products.error)
    throw new Error(`Falha ao listar produtos: ${products.error.message}`);
  const unitRules = history.data.supplier_id
    ? await supabase
        .from("supplier_product_nfe_unit_rules")
        .select("product_id, xml_unit, target_unit_id, mode, factor")
        .eq("company_id", companyId)
        .eq("supplier_id", history.data.supplier_id)
    : { data: [], error: null };
  if (unitRules.error) {
    throw new Error(
      `Falha ao carregar conversões aprendidas: ${unitRules.error.message}`,
    );
  }
  type UnitRuleRow = {
    product_id: string;
    xml_unit: string;
    target_unit_id: string;
    mode: string;
    factor: number | null;
  };
  const rulesByProduct = new Map<string, UnitRuleRow[]>();
  for (const rule of unitRules.data ?? []) {
    const current = rulesByProduct.get(rule.product_id) ?? [];
    current.push(rule);
    rulesByProduct.set(rule.product_id, current);
  }
  const signed = await supabase.storage
    .from("historical-nfe-documents")
    .createSignedUrl(history.data.storage_path, 600, {
      download: history.data.file_name,
    });
  return {
    history: {
      ...history.data,
      invoiceTotal: Number(history.data.invoice_total),
    },
    items: (items.data ?? []).map((item) => ({
      ...item,
      commercialQuantity: Number(item.commercial_quantity),
      commercialUnitPrice: Number(item.commercial_unit_price),
      tributaryQuantity: Number(item.tributary_quantity),
      tributaryUnitPrice: Number(item.tributary_unit_price),
      netProductTotal: Number(item.net_product_total),
      pricingQuantity:
        item.pricing_quantity === null ? null : Number(item.pricing_quantity),
      practicedPrice:
        item.practiced_price === null ? null : Number(item.practiced_price),
    })),
    suppliers: (suppliers.data ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      description:
        supplier.document_number ??
        supplier.legal_name ??
        (supplier.status === "active" ? "Ativo" : "Inativo"),
      documentNumber: supplier.document_number,
    })),
    products: (products.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      description: `${product.pricing_unit?.symbol ?? "sem unidade"}${product.is_active ? "" : " · inativo"}`,
      pricingUnitCode: product.pricing_unit?.code ?? "",
      pricingUnitSymbol: product.pricing_unit?.symbol ?? "",
      pricingUnitId: product.pricing_unit_id,
      unitRules: (rulesByProduct.get(product.id) ?? []).map((rule) => ({
        xmlUnit: rule.xml_unit,
        targetUnitId: rule.target_unit_id,
        mode: rule.mode,
        factor: rule.factor === null ? null : Number(rule.factor),
      })),
    })),
    downloadUrl: signed.data?.signedUrl ?? null,
  };
}

type PurchaseHistoryView =
  Database["public"]["Views"]["v_purchase_price_history"]["Row"];

export type PurchasePriceHistoryRow = PurchaseHistoryView & {
  event_id: string;
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  occurred_at: string;
  practiced_price: number;
  pricing_quantity: number;
};

type PurchaseScope = { productId: string } | { supplierId: string };

export function parsePurchaseHistoryPage(
  params: Record<string, string | string[] | undefined>,
) {
  const raw = Array.isArray(params.compras_pagina)
    ? params.compras_pagina[0]
    : params.compras_pagina;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function applyPurchaseFilters<
  T extends {
    gte: (column: string, value: string) => T;
    lt: (column: string, value: string) => T;
    eq: (column: string, value: string) => T;
  },
>(query: T, scope: PurchaseScope, filters: HistoryFilters): T {
  let next = query.eq(
    "productId" in scope ? "product_id" : "supplier_id",
    "productId" in scope ? scope.productId : scope.supplierId,
  );
  if (filters.relatedId) {
    next = next.eq(
      "productId" in scope ? "supplier_id" : "product_id",
      filters.relatedId,
    );
  }
  if (filters.from) next = next.gte("occurred_at", filters.from);
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    next = next.lt("occurred_at", end.toISOString());
  }
  return next;
}

export async function listPurchasePriceHistory(
  companyId: string,
  scope: PurchaseScope,
  filters: HistoryFilters,
  requestedPage: number,
) {
  const supabase = await createServerSupabaseClient();
  let countQuery = supabase
    .from("v_purchase_price_history")
    .select("event_id", { count: "exact", head: true })
    .eq("company_id", companyId);
  countQuery = applyPurchaseFilters(countQuery, scope, filters);
  const countResult = await countQuery;
  if (countResult.error) {
    throw new Error(
      `Falha ao contar compras efetivas: ${countResult.error.message}`,
    );
  }
  const total = countResult.count ?? 0;
  const pageSize = 20;
  const page = Math.min(
    requestedPage,
    Math.max(Math.ceil(total / pageSize), 1),
  );
  const start = (page - 1) * pageSize;

  let rowsQuery = supabase
    .from("v_purchase_price_history")
    .select("*")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .range(start, start + pageSize - 1);
  rowsQuery = applyPurchaseFilters(rowsQuery, scope, filters);

  let chartQuery = null;
  if ("productId" in scope) {
    chartQuery = supabase
      .from("v_purchase_price_history")
      .select("occurred_at, supplier_name, practiced_price")
      .eq("company_id", companyId)
      .eq("product_id", scope.productId)
      .order("occurred_at", { ascending: true })
      .limit(200);
    if (filters.from) chartQuery = chartQuery.gte("occurred_at", filters.from);
    if (filters.to)
      chartQuery = chartQuery.lte("occurred_at", `${filters.to}T23:59:59`);
    if (filters.relatedId)
      chartQuery = chartQuery.eq("supplier_id", filters.relatedId);
  }
  const scopeColumn = "productId" in scope ? "product_id" : "supplier_id";
  const scopeId = "productId" in scope ? scope.productId : scope.supplierId;
  const optionsQuery = supabase
    .from("v_purchase_price_history")
    .select("product_id, product_name, supplier_id, supplier_name")
    .eq("company_id", companyId)
    .eq(scopeColumn, scopeId)
    .limit(1000);

  const [rowsResult, chartResult, optionRows] = await Promise.all([
    rowsQuery,
    chartQuery ?? Promise.resolve({ data: [], error: null }),
    optionsQuery,
  ]);
  if (rowsResult.error) {
    throw new Error(
      `Falha ao carregar compras efetivas: ${rowsResult.error.message}`,
    );
  }
  const rows = (rowsResult.data ?? []).flatMap((row) =>
    row.event_id &&
    row.product_id &&
    row.product_name &&
    row.supplier_id &&
    row.supplier_name &&
    row.occurred_at &&
    row.practiced_price !== null &&
    row.pricing_quantity !== null
      ? [
          {
            ...row,
            event_id: row.event_id,
            product_id: row.product_id,
            product_name: row.product_name,
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name,
            occurred_at: row.occurred_at,
            practiced_price: Number(row.practiced_price),
            pricing_quantity: Number(row.pricing_quantity),
          },
        ]
      : [],
  ) satisfies PurchasePriceHistoryRow[];

  if (chartResult.error)
    throw new Error(
      `Falha ao montar evolução de compras: ${chartResult.error.message}`,
    );
  const pricePoints: PriceHistoryPoint[] = (chartResult.data ?? []).flatMap(
    (row) =>
      row.occurred_at && row.supplier_name && row.practiced_price !== null
        ? [
            {
              date: row.occurred_at,
              supplier: row.supplier_name,
              price: Number(row.practiced_price),
            },
          ]
        : [],
  );
  if (optionRows.error) {
    throw new Error(
      `Falha ao listar filtros de compras: ${optionRows.error.message}`,
    );
  }
  const optionMap = new Map<string, string>();
  for (const row of optionRows.data ?? []) {
    const id = "productId" in scope ? row.supplier_id : row.product_id;
    const name = "productId" in scope ? row.supplier_name : row.product_name;
    if (id && name) optionMap.set(id, name);
  }

  return {
    rows,
    pagination: { page, pageSize, total },
    pricePoints,
    options: [...optionMap].map(([id, name]) => ({ id, name })),
  };
}
