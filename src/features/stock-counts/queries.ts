import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CountProduct = {
  id: string;
  name: string;
  category: string;
  barcodes: string[];
};

export type CountUnit = { id: string; symbol: string; name: string };

export type CountEntry = {
  id: string;
  quantity: number;
  location: string | null;
  createdAt: string;
};

export type CountItem = {
  productId: string;
  name: string;
  category: string;
  unitId: string;
  /** Marcado para recontar: sobe para o topo em destaque até a recontagem. */
  needsRecount: boolean;
  entries: CountEntry[];
};

export type StockCountSummary = {
  id: string;
  name: string | null;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  products: number;
};

/**
 * Catálogo ativo para a busca e para o código de barras, com a categoria — a
 * mensagem de conferência agrupa por ela.
 *
 * Mesmo laço por `range` da lista de compras: o PostgREST corta em 1000 linhas
 * e o fim do alfabeto sumiria da busca.
 */
export async function listCountProducts(
  companyId: string,
): Promise<CountProduct[]> {
  const supabase = await createServerSupabaseClient();
  const data = [];

  for (let start = 0; ; start += 1000) {
    const page = await supabase
      .from("products")
      .select(
        `
      id,
      name,
      category:categories ( name ),
      product_barcodes ( code, is_active )
    `,
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(start, start + 999);

    if (page.error) {
      throw new Error(`Falha ao listar produtos: ${page.error.message}`);
    }
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  return data.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category?.name ?? "Sem categoria",
    barcodes: (product.product_barcodes ?? [])
      .filter((barcode) => barcode.is_active)
      .map((barcode) => barcode.code),
  }));
}

/** Unidades ativas da empresa: a da contagem é escolhida entre elas. */
export async function listCountUnits(companyId: string): Promise<CountUnit[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, symbol, name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("symbol");

  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`);
  return data ?? [];
}

/**
 * A unidade em que cada produto foi contado da última vez.
 *
 * Quem conta Coca em "un" hoje vai contar em "un" semana que vem; trazer a
 * escolha anterior evita repetir o mesmo toque em todo produto.
 */
export async function listLastCountUnits(
  companyId: string,
): Promise<Record<string, string>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_count_items")
    .select("product_id, unit_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(`Falha ao ler contagens: ${error.message}`);
  const last: Record<string, string> = {};
  for (const row of data ?? []) {
    last[row.product_id] ??= row.unit_id;
  }
  return last;
}

export async function listStockCounts(
  companyId: string,
): Promise<StockCountSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select("id, name, status, created_at, closed_at, stock_count_items ( count )")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) throw new Error(`Falha ao listar contagens: ${error.message}`);
  return (data ?? []).map((count) => ({
    id: count.id,
    name: count.name,
    status: count.status === "closed" ? "closed" : "open",
    createdAt: count.created_at,
    closedAt: count.closed_at,
    products: count.stock_count_items[0]?.count ?? 0,
  }));
}

export async function getStockCount(companyId: string, id: string) {
  const supabase = await createServerSupabaseClient();
  const { data: count, error } = await supabase
    .from("stock_counts")
    .select("id, name, status, created_at, closed_at, created_by, public_token")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao abrir a contagem: ${error.message}`);
  if (!count) return null;

  const [items, author] = await Promise.all([
    supabase
      .from("stock_count_items")
      .select(
        `
        product_id,
        unit_id,
        needs_recount,
        products!inner ( name, category:categories ( name ) ),
        stock_count_entries ( id, quantity, location, created_at )
      `,
      )
      .eq("company_id", companyId)
      .eq("stock_count_id", id),
    count.created_by
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", count.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (items.error) {
    throw new Error(`Falha ao carregar a contagem: ${items.error.message}`);
  }

  return {
    id: count.id,
    name: count.name,
    status: count.status === "closed" ? ("closed" as const) : ("open" as const),
    createdAt: count.created_at,
    closedAt: count.closed_at,
    author: author.data?.full_name ?? null,
    publicToken: count.public_token,
    items: (items.data ?? []).map(
      (item): CountItem => ({
        productId: item.product_id,
        name: item.products.name,
        category: item.products.category?.name ?? "Sem categoria",
        unitId: item.unit_id,
        needsRecount: item.needs_recount,
        entries: (item.stock_count_entries ?? [])
          .map((entry) => ({
            id: entry.id,
            quantity: Number(entry.quantity),
            location: entry.location,
            createdAt: entry.created_at,
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }),
    ),
  };
}
