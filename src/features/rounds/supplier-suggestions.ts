import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Quem convidar para esta cotação, a partir do que ela pede.
 *
 * O sinal é o vínculo fornecedor×produto CONFIRMADO (`supplier_products`), que
 * o sistema grava sozinho quando o fornecedor responde uma cotação, quando uma
 * compra é recebida ou uma NF-e histórica é conciliada. Vínculo "provável" e
 * "não fornece" ficam de fora: o primeiro ainda é palpite, o segundo é o
 * contrário do que se procura.
 *
 * A ordem é a cobertura — quantos dos produtos pedidos o fornecedor já
 * vendeu —, e não uma nota: o motivo da sugestão precisa caber numa frase que
 * quem compra confira de cabeça.
 */

/** O mínimo que a sugestão lê de um item da rodada. */
export type ItemParaSugerir = {
  product_id: string;
  group_id: string;
  commercial_status: string;
  products: { name: string } | null;
};

export type FornecedorCandidato = { id: string; name: string };

export type SugestaoDeFornecedor = {
  supplierId: string;
  name: string;
  /** Quantos produtos da rodada ele já vendeu. */
  cobre: number;
  /** Desses, quantos ainda não têm nenhum convidado que os cubra. */
  cobreOQueFalta: number;
  /** Grupos que contêm algo que ele vende: os que o convite já marca. */
  groupIds: string[];
  /** Título do aviso de prioridade alta em aberto, se houver. */
  aviso: string | null;
};

export type SugestoesDaRodada = {
  totalDeProdutos: number;
  sugestoes: SugestaoDeFornecedor[];
  /** Produtos que nenhum fornecedor ativo, convidado ou não, já vendeu. */
  semFornecedor: string[];
};

type Vinculo = { supplier_id: string; product_id: string };
type Aviso = { supplier_id: string; title: string };

const LOTE = 80;

/** A parte pura: transforma vínculos em sugestões. Sem banco, sem efeitos. */
export function montarSugestoes({
  items,
  candidatos,
  convidados,
  vinculos,
  avisos,
}: {
  items: ItemParaSugerir[];
  candidatos: FornecedorCandidato[];
  /** Fornecedores já na rodada. */
  convidados: Set<string>;
  /** Vínculos confirmados de fornecedores ativos com os produtos da rodada. */
  vinculos: Vinculo[];
  avisos: Aviso[];
}): SugestoesDaRodada {
  const ativos = items.filter((item) => item.commercial_status !== "cancelled");
  const produtos = new Map<string, { nome: string; grupos: Set<string> }>();
  for (const item of ativos) {
    const produto = produtos.get(item.product_id) ?? {
      nome: item.products?.name ?? "Produto",
      grupos: new Set<string>(),
    };
    produto.grupos.add(item.group_id);
    produtos.set(item.product_id, produto);
  }

  const vendidoPor = new Map<string, Set<string>>();
  for (const { supplier_id, product_id } of vinculos) {
    if (!produtos.has(product_id)) continue;
    const doFornecedor = vendidoPor.get(supplier_id) ?? new Set<string>();
    doFornecedor.add(product_id);
    vendidoPor.set(supplier_id, doFornecedor);
  }

  // O que algum convidado já cobre: quem convidar a seguir vale mais pelo que
  // acrescenta do que pelo que repete.
  const cobertoPorConvidado = new Set<string>();
  for (const id of convidados) {
    for (const produto of vendidoPor.get(id) ?? []) {
      cobertoPorConvidado.add(produto);
    }
  }

  const avisoDe = new Map<string, string>();
  for (const aviso of avisos) {
    if (!avisoDe.has(aviso.supplier_id)) {
      avisoDe.set(aviso.supplier_id, aviso.title);
    }
  }

  const sugestoes: SugestaoDeFornecedor[] = [];
  for (const candidato of candidatos) {
    if (convidados.has(candidato.id)) continue;
    const vende = vendidoPor.get(candidato.id);
    if (!vende || vende.size === 0) continue;

    const grupos = new Set<string>();
    let cobreOQueFalta = 0;
    for (const produtoId of vende) {
      for (const grupo of produtos.get(produtoId)?.grupos ?? []) {
        grupos.add(grupo);
      }
      if (!cobertoPorConvidado.has(produtoId)) cobreOQueFalta += 1;
    }

    sugestoes.push({
      supplierId: candidato.id,
      name: candidato.name,
      cobre: vende.size,
      cobreOQueFalta,
      groupIds: [...grupos],
      aviso: avisoDe.get(candidato.id) ?? null,
    });
  }
  sugestoes.sort(
    (a, b) => b.cobre - a.cobre || a.name.localeCompare(b.name, "pt-BR"),
  );

  const comAlguemQueVende = new Set<string>();
  for (const produtosDoFornecedor of vendidoPor.values()) {
    for (const produtoId of produtosDoFornecedor) {
      comAlguemQueVende.add(produtoId);
    }
  }
  const semFornecedor = [...produtos.entries()]
    .filter(([id]) => !comAlguemQueVende.has(id))
    .map(([, produto]) => produto.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { totalDeProdutos: produtos.size, sugestoes, semFornecedor };
}

/** Lê os vínculos e avisos e entrega as sugestões da rodada. */
export async function sugerirFornecedores({
  companyId,
  items,
  candidatos,
  convidados,
}: {
  companyId: string;
  items: ItemParaSugerir[];
  candidatos: FornecedorCandidato[];
  convidados: Set<string>;
}): Promise<SugestoesDaRodada> {
  const produtoIds = [
    ...new Set(
      items
        .filter((item) => item.commercial_status !== "cancelled")
        .map((item) => item.product_id),
    ),
  ];
  if (produtoIds.length === 0) {
    return { totalDeProdutos: 0, sugestoes: [], semFornecedor: [] };
  }

  const supabase = await createServerSupabaseClient();
  const lotes: string[][] = [];
  for (let i = 0; i < produtoIds.length; i += LOTE) {
    lotes.push(produtoIds.slice(i, i + LOTE));
  }

  const [vinculosPorLote, avisosAbertos] = await Promise.all([
    Promise.all(
      lotes.map(async (lote) => {
        const { data, error } = await supabase
          .from("supplier_products")
          .select("supplier_id, product_id, suppliers!inner ( status )")
          .eq("company_id", companyId)
          .eq("status", "confirmed")
          .eq("suppliers.status", "active")
          .in("product_id", lote);
        if (error) {
          throw new Error(
            `Falha ao ler os vínculos dos fornecedores: ${error.message}`,
          );
        }
        return data ?? [];
      }),
    ),
    supabase
      .from("supplier_notices")
      .select("supplier_id, title")
      .eq("company_id", companyId)
      .eq("status", "open")
      .eq("priority", "high")
      .order("created_at", { ascending: false }),
  ]);

  // Um aviso que não carrega não derruba a sugestão: ela só perde o destaque.
  const avisos: Aviso[] = avisosAbertos.error ? [] : (avisosAbertos.data ?? []);

  return montarSugestoes({
    items,
    candidatos,
    convidados,
    vinculos: vinculosPorLote.flat(),
    avisos,
  });
}
