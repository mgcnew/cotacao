"use server";

import {
  isSearchKind,
  type SearchHit,
  type SearchKind,
} from "@/features/search/kinds";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Busca global, a que atende a caixa do menu.
 *
 * É uma server action e não uma rota: assim a autorização passa pelo mesmo
 * caminho do resto do app (`requireActiveCompany` + permissões), sem uma
 * segunda porta de entrada para proteger.
 *
 * O que se pode achar é o que se pode ver. Quem não tem `product.view` não
 * recebe produto na sugestão — e se contornar a tela, a RLS recusa igual: a
 * RPC não é `security definer`, ela lê pelas policies de quem chama.
 */

/**
 * Para onde cada resultado leva.
 *
 * Produto não tem página própria, então cai na lista já filtrada por ele —
 * melhor do que largar a pessoa num catálogo inteiro para procurar de novo.
 */
function hrefFor(kind: SearchKind, id: string, title: string): string {
  switch (kind) {
    case "supplier":
      return `/fornecedores/${id}`;
    case "order":
      return `/pedidos/${id}`;
    case "round":
      return `/compras/${id}`;
    case "product":
      return `/produtos?busca=${encodeURIComponent(title)}`;
  }
}

export async function searchCompany(term: string): Promise<SearchHit[]> {
  const limpo = term.trim();
  if (limpo.length === 0) return [];

  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  const podeRodadas = permissions.has("purchase_round.view");
  const podePedidos = permissions.has("order.view");
  const podeProdutos = permissions.has("product.view");
  const podeFornecedores = permissions.has("supplier.view");

  // Sem nenhuma permissão de leitura não há o que buscar, e a ida ao banco
  // seria certamente vazia.
  if (!podeRodadas && !podePedidos && !podeProdutos && !podeFornecedores) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_search_company", {
    p_company_id: company.companyId,
    p_term: limpo,
    p_rounds: podeRodadas,
    p_orders: podePedidos,
    p_products: podeProdutos,
    p_suppliers: podeFornecedores,
    p_limit: 8,
  });

  if (error) {
    // Busca que falha não pode derrubar a tela em que a pessoa está: ela é um
    // atalho, não o caminho. O erro vai para o log do servidor.
    console.error("[searchCompany] falhou:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isSearchKind(row.kind))
    .map((row) => {
      const kind = row.kind as SearchKind;
      return {
        key: `${kind}-${row.id}`,
        kind,
        title: row.title,
        subtitle: row.subtitle,
        href: hrefFor(kind, row.id, row.title),
      };
    });
}
