import "server-only";

import type { ProductListFilters } from "@/features/products/filters";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Leituras do catálogo. Todas filtram por company_id explicitamente, mesmo a
 * RLS já isolando: o filtro deixa a intenção clara e evita varredura inútil.
 */

/**
 * Catálogo completo para montar rodadas, onde o usuário procura qualquer item.
 *
 * Pagina por `range` porque o PostgREST devolve no máximo `db.max_rows` (1000)
 * linhas de topo: sem isso o fim do alfabeto some da busca sem nenhum aviso.
 */
export async function listProducts(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const rows = [];

  for (let start = 0; ; start += 1000) {
    // products referencia units 3x, então o join precisa nomear a FK.
    const page = await supabase
      .from("products")
      .select(
        `
      id,
      name,
      category_id,
      purpose,
      is_active,
      product_barcodes ( code, is_primary, is_active ),
      categories:categories!products_company_id_category_id_fkey ( name ),
      purchase_unit:units!products_company_id_purchase_unit_id_fkey ( code, symbol ),
      pricing_unit:units!products_company_id_pricing_unit_id_fkey ( code, symbol ),
      comparison_unit:units!products_company_id_comparison_unit_id_fkey ( code, symbol )
    `,
      )
      .eq("company_id", companyId)
      .order("name")
      .order("id")
      .range(start, start + 999);

    if (page.error) {
      throw new Error(`Falha ao listar produtos: ${page.error.message}`);
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  return rows;
}

export type ProductListRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  purpose: string;
  isActive: boolean;
  purchaseUnitCode: string;
  pricingUnitCode: string;
  comparisonUnitCode: string | null;
  unitsEditable: boolean;
};

export type ProductFilterCategory = { id: string; name: string };

type ProductPagePayload = {
  rows: ProductListRow[];
  total: number;
  catalogTotal: number;
  page: number;
  pageSize: number;
  categories: ProductFilterCategory[];
};

/** Recorte enxuto usado somente pela tela do catálogo. */
export async function listProductsPage(
  companyId: string,
  filters: ProductListFilters,
  pagination: { page: number; pageSize: number },
): Promise<ProductPagePayload> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_list_products_page", {
    p_company_id: companyId,
    p_page: pagination.page,
    p_page_size: pagination.pageSize,
    p_search: filters.busca || undefined,
    p_status: filters.status ?? undefined,
    p_category_id: filters.categoriaId ?? undefined,
  });

  if (error) throw new Error(`Falha ao listar produtos: ${error.message}`);
  const payload = data as unknown as ProductPagePayload | null;
  if (
    !payload ||
    !Array.isArray(payload.rows) ||
    !Array.isArray(payload.categories)
  ) {
    throw new Error("Falha ao listar produtos: resposta inválida do banco.");
  }

  return {
    ...payload,
    total: Number(payload.total),
    catalogTotal: Number(payload.catalogTotal),
    page: Number(payload.page),
    pageSize: Number(payload.pageSize),
  };
}

export async function getProduct(companyId: string, productId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      purpose,
      is_active,
      categories:categories!products_company_id_category_id_fkey ( name ),
      purchase_unit:units!products_company_id_purchase_unit_id_fkey ( symbol ),
      pricing_unit:units!products_company_id_pricing_unit_id_fkey ( symbol ),
      comparison_unit:units!products_company_id_comparison_unit_id_fkey ( symbol ),
      product_barcodes ( code, is_primary, is_active )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar produto: ${error.message}`);
  return data;
}

/** Dados mínimos para corrigir unidades de um produto ainda sem uso. */
export async function getProductUnitEditContext(
  companyId: string,
  productId: string,
) {
  const supabase = await createServerSupabaseClient();
  const [product, lock] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,purchase_unit_id,pricing_unit_id,comparison_unit_id",
      )
      .eq("company_id", companyId)
      .eq("id", productId)
      .maybeSingle(),
    supabase.rpc("rpc_product_units_lock_reason", {
      p_company_id: companyId,
      p_product_id: productId,
    }),
  ]);

  if (product.error) {
    throw new Error(`Falha ao carregar produto: ${product.error.message}`);
  }
  if (lock.error && product.data) {
    throw new Error(
      `Falha ao verificar o uso do produto: ${lock.error.message}`,
    );
  }

  return product.data
    ? {
        product: {
          id: product.data.id,
          name: product.data.name,
          purchaseUnitId: product.data.purchase_unit_id,
          pricingUnitId: product.data.pricing_unit_id,
          comparisonUnitId: product.data.comparison_unit_id,
        },
        lockReason: lock.data,
      }
    : null;
}

export async function getCatalogCounts(companyId: string) {
  const supabase = await createServerSupabaseClient();

  // Os totais chegam depois da lista por Suspense e não bloqueiam o catálogo.
  const [categories, units] = await Promise.all([
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
  ]);

  return {
    categories: categories.count ?? 0,
    units: units.count ?? 0,
  };
}

/**
 * Categorias da empresa, com quantos produtos dependem de cada uma.
 *
 * A contagem não é enfeite: como `products.category_id` tem FK
 * `ON DELETE RESTRICT` e não existe policy de DELETE em categories, o caminho
 * para tirar uma categoria de circulação é desativá-la. Mostrar o vínculo
 * explica ao usuário por que ela não simplesmente some.
 */
export async function listCategories(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description, is_active, products(count)")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`Falha ao listar categorias: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    productCount: row.products[0]?.count ?? 0,
  }));
}

export type AttributeDefinition = {
  id: string;
  categoryId: string;
  name: string;
  key: string;
  dataType: "text" | "numeric" | "boolean";
  unitId: string | null;
  unitSymbol: string | null;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Divide o preço cotado para chegar à unidade de comparação. */
  isConversionFactor: boolean;
};

/**
 * Atributos definidos por categoria.
 *
 * O schema permite que uma definição pertença a uma categoria OU a um produto
 * específico (CHECK `num_nonnulls(category_id, product_id) = 1`). Aqui só
 * tratamos as de categoria, que é o caso descrito no documento mestre:
 * "Embalagens poderão solicitar atributos específicos".
 */
export async function listAttributeDefinitions(
  companyId: string,
  categoryId?: string,
): Promise<AttributeDefinition[]> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("product_attribute_definitions")
    .select(
      "id, category_id, name, key, data_type, unit_id, is_required, is_active, sort_order, is_conversion_factor, units ( symbol )",
    )
    .eq("company_id", companyId)
    .not("category_id", "is", null)
    .order("sort_order")
    .order("name");

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar atributos: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id as string,
    name: row.name,
    key: row.key,
    dataType: row.data_type as AttributeDefinition["dataType"],
    unitId: row.unit_id,
    unitSymbol: row.units?.symbol ?? null,
    isRequired: row.is_required,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    isConversionFactor: row.is_conversion_factor,
  }));
}

export async function getCategory(companyId: string, categoryId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active")
    .eq("company_id", companyId)
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar categoria: ${error.message}`);
  return data;
}

export async function listUnits(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, code, name, symbol, kind, is_active")
    .eq("company_id", companyId)
    .order("code");

  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`);
  return data ?? [];
}
