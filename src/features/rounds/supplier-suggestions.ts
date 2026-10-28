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
 *
 * A confiabilidade entra por cima, sem virar nota também. Nas cotações
 * anteriores, quantas vezes o fornecedor respondeu; e há quanto tempo comprou
 * algo desta lista. Desempata quem cobre o mesmo e rebaixa, com o motivo à
 * vista, quem já deixou de responder mais vezes do que respondeu.
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
  /** Das últimas cotações concluídas em que foi convidado (até 5)... */
  convites: number;
  /** ...em quantas deu retorno, mesmo parcial. */
  respondeu: number;
  /** Mediana, em minutos, entre o envio do link e a resposta; só link, não digitada. */
  respostaTipicaMin: number | null;
  /** Compra mais recente de algo desta lista (ISO), se houver. */
  ultimaCompraEm: string | null;
  /** Já deixou de responder mais vezes do que respondeu: vai para o fim da fila. */
  costumaNaoResponder: boolean;
};

export type SugestoesDaRodada = {
  /** Instante em que a leitura foi feita: a referência de "há 12 dias". */
  geradoEm: number;
  totalDeProdutos: number;
  sugestoes: SugestaoDeFornecedor[];
  /** Produtos que nenhum fornecedor ativo, convidado ou não, já vendeu. */
  semFornecedor: string[];
};

type Vinculo = { supplier_id: string; product_id: string };
type Aviso = { supplier_id: string; title: string };
type CompraRecente = {
  supplier_id: string;
  product_id: string;
  occurred_at: string;
};
/** Um convite enviado numa cotação já concluída, e a resposta que teve. */
export type ConviteAnterior = {
  supplier_id: string;
  first_sent_at: string;
  quotation_responses:
    | { status: string; source: string; submitted_at: string | null }[]
    | { status: string; source: string; submitted_at: string | null }
    | null;
};

/** Quantas cotações recentes contam, e a partir de quantas dá para julgar. */
const JANELA = 5;
const AMOSTRA_MINIMA = 3;

const LOTE = 80;

function respostaDe(convite: ConviteAnterior) {
  const resposta = convite.quotation_responses;
  return Array.isArray(resposta) ? (resposta[0] ?? null) : resposta;
}

/**
 * Só o retorno pelo link diz a rapidez do fornecedor: preço digitado pela
 * equipe depois de um telefonema carrega a hora do lançamento, não a da resposta.
 */
function medianaDeResposta(convites: ConviteAnterior[]): number | null {
  const minutos = convites
    .flatMap((convite) => {
      const resposta = respostaDe(convite);
      if (resposta?.source !== "supplier_link" || !resposta.submitted_at) {
        return [];
      }
      const espera =
        Date.parse(resposta.submitted_at) - Date.parse(convite.first_sent_at);
      return espera >= 0 ? [espera / 60_000] : [];
    })
    .sort((a, b) => a - b);
  if (minutos.length < AMOSTRA_MINIMA) return null;
  const meio = Math.floor(minutos.length / 2);
  return minutos.length % 2
    ? minutos[meio]
    : (minutos[meio - 1] + minutos[meio]) / 2;
}

/** Desempate: quem já provou responder vale mais que quem ainda não tem histórico. */
function confianca(s: SugestaoDeFornecedor): number {
  if (s.convites < AMOSTRA_MINIMA) return 0.9;
  return s.respondeu / s.convites;
}

/** A parte pura: transforma vínculos em sugestões. Sem banco, sem efeitos. */
export function montarSugestoes({
  items,
  candidatos,
  convidados,
  vinculos,
  avisos,
  convitesAnteriores = [],
  compras = [],
}: {
  items: ItemParaSugerir[];
  candidatos: FornecedorCandidato[];
  /** Fornecedores já na rodada. */
  convidados: Set<string>;
  /** Vínculos confirmados de fornecedores ativos com os produtos da rodada. */
  vinculos: Vinculo[];
  avisos: Aviso[];
  convitesAnteriores?: ConviteAnterior[];
  compras?: CompraRecente[];
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

  // Os convites mais recentes de cada fornecedor, já ordenados do mais novo.
  const convitesDe = new Map<string, ConviteAnterior[]>();
  for (const convite of [...convitesAnteriores].sort((a, b) =>
    b.first_sent_at.localeCompare(a.first_sent_at),
  )) {
    const lista = convitesDe.get(convite.supplier_id) ?? [];
    if (lista.length < JANELA) lista.push(convite);
    convitesDe.set(convite.supplier_id, lista);
  }

  const ultimaCompraDe = new Map<string, string>();
  for (const compra of compras) {
    if (!produtos.has(compra.product_id)) continue;
    const atual = ultimaCompraDe.get(compra.supplier_id);
    if (!atual || compra.occurred_at > atual) {
      ultimaCompraDe.set(compra.supplier_id, compra.occurred_at);
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

    const convites = convitesDe.get(candidato.id) ?? [];
    const respostas = convites.map(respostaDe);
    const respondeu = respostas.filter(
      (r) => r && (r.status === "partial" || r.status === "completed"),
    ).length;
    const respostaTipicaMin = medianaDeResposta(convites);

    sugestoes.push({
      supplierId: candidato.id,
      name: candidato.name,
      cobre: vende.size,
      cobreOQueFalta,
      groupIds: [...grupos],
      aviso: avisoDe.get(candidato.id) ?? null,
      convites: convites.length,
      respondeu,
      respostaTipicaMin,
      ultimaCompraEm: ultimaCompraDe.get(candidato.id) ?? null,
      costumaNaoResponder:
        convites.length >= AMOSTRA_MINIMA && respondeu / convites.length < 0.5,
    });
  }
  sugestoes.sort(
    (a, b) =>
      Number(a.costumaNaoResponder) - Number(b.costumaNaoResponder) ||
      b.cobre - a.cobre ||
      confianca(b) - confianca(a) ||
      (b.ultimaCompraEm ?? "").localeCompare(a.ultimaCompraEm ?? "") ||
      a.name.localeCompare(b.name, "pt-BR"),
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

  return {
    geradoEm: Date.now(),
    totalDeProdutos: produtos.size,
    sugestoes,
    semFornecedor,
  };
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
    return {
      geradoEm: Date.now(),
      totalDeProdutos: 0,
      sugestoes: [],
      semFornecedor: [],
    };
  }

  const supabase = await createServerSupabaseClient();
  const lotes: string[][] = [];
  for (let i = 0; i < produtoIds.length; i += LOTE) {
    lotes.push(produtoIds.slice(i, i + LOTE));
  }

  const [vinculosPorLote, avisosAbertos, convitesAbertos, comprasPorLote] =
    await Promise.all([
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
      // Das cotações concluídas: uma em andamento ainda espera resposta, e contar
      // essa espera como falta de retorno puniria quem só não teve tempo.
      supabase
        .from("round_suppliers")
        .select(
          "supplier_id, first_sent_at, purchase_rounds!inner ( status ), quotation_responses ( status, source, submitted_at )",
        )
        .eq("company_id", companyId)
        .eq("purchase_rounds.status", "completed")
        .is("removed_at", null)
        .not("first_sent_at", "is", null)
        .order("first_sent_at", { ascending: false })
        .limit(1000),
      Promise.all(
        lotes.map(async (lote) => {
          const { data, error } = await supabase
            .from("v_latest_supplier_product_price")
            .select("supplier_id, product_id, occurred_at")
            .eq("company_id", companyId)
            .in("product_id", lote);
          // Sem a data da última compra a sugestão só perde esse detalhe.
          return error ? [] : (data ?? []);
        }),
      ),
    ]);

  // Um aviso que não carrega não derruba a sugestão: ela só perde o destaque.
  const avisos: Aviso[] = avisosAbertos.error ? [] : (avisosAbertos.data ?? []);
  const convitesAnteriores: ConviteAnterior[] = convitesAbertos.error
    ? []
    : ((convitesAbertos.data ?? []) as unknown as ConviteAnterior[]);
  const compras: CompraRecente[] = comprasPorLote.flat().flatMap((c) =>
    c.supplier_id && c.product_id && c.occurred_at
      ? [
          {
            supplier_id: c.supplier_id,
            product_id: c.product_id,
            occurred_at: c.occurred_at,
          },
        ]
      : [],
  );

  return montarSugestoes({
    items,
    candidatos,
    convidados,
    vinculos: vinculosPorLote.flat(),
    avisos,
    convitesAnteriores,
    compras,
  });
}
