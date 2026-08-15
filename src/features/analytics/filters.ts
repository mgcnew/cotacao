import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Filtros globais da Central de Análises.
 *
 * Vivem na URL, não em estado de cliente: assim o recorte é compartilhável,
 * sobrevive a recarregar a página e volta certo pelo botão de voltar. O
 * formulário é um GET comum — funciona sem JavaScript.
 */

export type AnalyticsFilters = {
  de: string | null;
  ate: string | null;
  categoriaId: string | null;
  produtoId: string | null;
  fornecedorId: string | null;
};

const VAZIO: AnalyticsFilters = {
  de: null,
  ate: null,
  categoriaId: null,
  produtoId: null,
  fornecedorId: null,
};

function texto(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const limpo = (raw ?? "").trim();
  return limpo === "" ? null : limpo;
}

/**
 * Id só é aceito se for UUID.
 *
 * O valor vem da URL, onde qualquer um pode digitar qualquer coisa. Sem esta
 * checagem, `?fornecedor=abc` chega ao Postgres e derruba a página inteira com
 * "invalid input syntax for type uuid". Filtro inválido é filtro ignorado.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return UUID.test(raw) ? raw : null;
}

/** Data só é aceita no formato do input nativo; qualquer outra coisa é ignorada. */
function data(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AnalyticsFilters {
  return {
    ...VAZIO,
    de: data(searchParams.de),
    ate: data(searchParams.ate),
    categoriaId: id(searchParams.categoria),
    produtoId: id(searchParams.produto),
    fornecedorId: id(searchParams.fornecedor),
  };
}

export function hasAnyFilter(f: AnalyticsFilters): boolean {
  return Object.values(f).some((v) => v !== null);
}

/**
 * Produtos que atendem ao recorte de categoria e/ou produto.
 *
 * Devolve `null` quando não há restrição por produto — diferente de lista
 * vazia, que significa "o recorte não casou com nenhum produto" e deve zerar
 * o resultado em vez de ignorar o filtro.
 */
export async function resolveProductIds(
  companyId: string,
  f: AnalyticsFilters,
): Promise<string[] | null> {
  if (!f.categoriaId && !f.produtoId) return null;

  if (f.produtoId && !f.categoriaId) return [f.produtoId];

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId);

  if (f.categoriaId) query = query.eq("category_id", f.categoriaId);
  if (f.produtoId) query = query.eq("id", f.produtoId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Falha ao aplicar o filtro: ${error.message}`);

  return (rows ?? []).map((r) => r.id);
}

/** Opções dos seletores, já restritas à empresa ativa pela RLS. */
export async function getFilterOptions(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const [categorias, produtos, fornecedores] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("products")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name"),
  ]);

  return {
    categorias: categorias.data ?? [],
    produtos: produtos.data ?? [],
    fornecedores: fornecedores.data ?? [],
  };
}
