import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ShoppingProduct = {
  id: string;
  name: string;
  purchaseUnit: string;
  barcodes: string[];
};

/**
 * Catálogo ativo inteiro, usado pelo autocomplete e pelo casamento de código de
 * barras — que precisam enxergar todos os produtos, não só os primeiros.
 *
 * O PostgREST corta a resposta em `db.max_rows` (1000). Sem paginar, o catálogo
 * simplesmente sumia do fim do alfabeto: com 1079 ativos, tudo a partir de
 * "Pao de alho…" ficava invisível na busca. O laço por `range` é o mesmo
 * recurso já usado em analytics e no painel financeiro.
 */
export async function listShoppingProducts(
  companyId: string,
): Promise<ShoppingProduct[]> {
  const supabase = await createServerSupabaseClient();
  const data = [];

  for (let start = 0; ; start += 1000) {
    const page = await supabase
      .from("products")
      .select(
        `
      id,
      name,
      purchase_unit:units!products_company_id_purchase_unit_id_fkey ( symbol ),
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
    purchaseUnit: product.purchase_unit?.symbol ?? "",
    barcodes: (product.product_barcodes ?? [])
      .filter((barcode) => barcode.is_active)
      .map((barcode) => barcode.code),
  }));
}

export async function getOpenShoppingList(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: list, error: listError } = await supabase
    .from("shopping_lists")
    .select("id, name, created_at")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();

  if (listError) throw new Error(`Falha ao abrir a lista: ${listError.message}`);
  if (!list) return { list: null, items: [] };

  const { data: items, error: itemsError } = await supabase
    .from("shopping_list_items")
    .select(
      `
      id,
      product_id,
      requested_quantity,
      notes,
      created_at,
      products!inner ( name, is_active ),
      purchase_unit:units!shopping_list_items_company_id_purchase_unit_id_fkey ( symbol )
    `,
    )
    .eq("company_id", companyId)
    .eq("shopping_list_id", list.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (itemsError) {
    throw new Error(`Falha ao carregar itens da lista: ${itemsError.message}`);
  }

  return { list, items: items ?? [] };
}

export async function listPendingShoppingItems(companyId: string) {
  return (await getOpenShoppingList(companyId)).items.map((item) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.products.name,
    quantity: String(item.requested_quantity).replace(".", ","),
    purchaseUnit: item.purchase_unit?.symbol ?? "",
    notes: item.notes ?? "",
    isActive: item.products.is_active,
  }));
}
