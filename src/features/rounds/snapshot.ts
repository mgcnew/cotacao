import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/dal";

/**
 * Os indicadores da Central da Rodada — documento mestre, 6.3.
 *
 * Uma leitura só, pela `rpc_round_snapshot` da 0038. Montar isto no cliente
 * seriam cinco: itens, respostas, negociações, alocações e pedidos.
 *
 * Fica fora do `carregarRodada` de propósito. A Central abre em modal, e o que
 * o modal precisa mostrar primeiro são as seções; os números entram por uma
 * fronteira de espera própria, e chegar depois deles não atrasa o resto.
 */
export type IndicadoresDaRodada = {
  itensAtivos: number;
  itensComResposta: number;
  itensProntos: number;
  itensAlocados: number;
  gruposAbertos: number;
  fornecedores: number;
  fornecedoresEnviados: number;
  fornecedoresResponderam: number;
  itensNegociados: number;
  alocacoesRascunho: number;
  pedidosGerados: number;
};

export const carregarIndicadoresDaRodada = cache(
  async (roundId: string): Promise<IndicadoresDaRodada | null> => {
    const company = await requireActiveCompany();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .rpc("rpc_round_snapshot", {
        p_company_id: company.companyId,
        p_purchase_round_id: roundId,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao ler indicadores da rodada: ${error.message}`);
    }
    if (!data) return null;

    return {
      itensAtivos: data.itens_ativos ?? 0,
      itensComResposta: data.itens_com_resposta ?? 0,
      itensProntos: data.itens_prontos ?? 0,
      itensAlocados: data.itens_alocados ?? 0,
      gruposAbertos: data.grupos_abertos ?? 0,
      fornecedores: data.fornecedores ?? 0,
      fornecedoresEnviados: data.fornecedores_enviados ?? 0,
      fornecedoresResponderam: data.fornecedores_responderam ?? 0,
      itensNegociados: data.itens_negociados ?? 0,
      alocacoesRascunho: data.alocacoes_rascunho ?? 0,
      pedidosGerados: data.pedidos_gerados ?? 0,
    };
  },
);

/** Uma pendência da rodada: o que falta, e para onde ir resolver. */
export type PendenciaDaRodada = {
  chave: string;
  texto: string;
  detalhe: string;
  href?: string;
  acao?: string;
  /** Bloqueia o avanço da rodada, ou é só a próxima coisa a fazer? */
  travando: boolean;
};

/**
 * O que falta para a rodada andar.
 *
 * Derivado dos indicadores, sem consulta nova. A ordem é a do fluxo — quem não
 * recebeu o link vem antes de quem não respondeu, que vem antes do que já dá
 * para decidir —, então a primeira linha é sempre a próxima coisa a fazer.
 */
export function pendenciasDaRodada(
  i: IndicadoresDaRodada,
  roundId: string,
): PendenciaDaRodada[] {
  const pendencias: PendenciaDaRodada[] = [];
  const semEnvio = i.fornecedores - i.fornecedoresEnviados;
  const semResposta = i.fornecedoresEnviados - i.fornecedoresResponderam;
  const itensSemResposta = i.itensAtivos - i.itensComResposta;

  if (semEnvio > 0) {
    pendencias.push({
      chave: "sem-envio",
      texto: `${semEnvio} ${semEnvio === 1 ? "fornecedor não recebeu" : "fornecedores não receberam"} o link`,
      detalhe:
        "Iniciar a rodada gera o link de cada um, mas não envia — o envio é seu.",
      travando: true,
    });
  }

  if (semResposta > 0) {
    pendencias.push({
      chave: "sem-resposta",
      texto: `${semResposta} ${semResposta === 1 ? "recebeu e não respondeu" : "receberam e não responderam"}`,
      detalhe:
        "Dá para cobrar pelo mesmo link, ou lançar o preço no lugar dele na comparação.",
      href: `/compras/${roundId}/comparacao`,
      acao: "Lançar preço",
      travando: false,
    });
  }

  if (itensSemResposta > 0) {
    pendencias.push({
      chave: "itens-sem-resposta",
      texto: `${itensSemResposta} ${itensSemResposta === 1 ? "produto sem nenhum preço" : "produtos sem nenhum preço"}`,
      detalhe: "Sem ao menos uma resposta, não há o que decidir nesses itens.",
      href: `/compras/${roundId}/comparacao`,
      acao: "Ver comparação",
      travando: true,
    });
  }

  if (i.itensProntos > 0) {
    pendencias.push({
      chave: "prontos",
      texto: `${i.itensProntos} ${i.itensProntos === 1 ? "produto pronto para decidir" : "produtos prontos para decidir"}`,
      detalhe: "Já têm preço e ninguém escolheu de quem comprar.",
      href: `/compras/${roundId}/alocacao`,
      acao: "Decidir compra",
      travando: false,
    });
  }

  if (i.alocacoesRascunho > 0) {
    pendencias.push({
      chave: "rascunhos",
      texto: `${i.alocacoesRascunho} ${i.alocacoesRascunho === 1 ? "decisão em rascunho" : "decisões em rascunho"}`,
      detalhe: "Decidido, mas ainda não virou pedido.",
      href: `/compras/${roundId}/alocacao`,
      acao: "Confirmar",
      travando: false,
    });
  }

  // Nada pendente e pedido gerado: o que falta é dizer que acabou.
  if (
    pendencias.length === 0 &&
    i.pedidosGerados > 0 &&
    i.itensAtivos > 0
  ) {
    pendencias.push({
      chave: "concluir",
      texto: "Tudo decidido e os pedidos saíram",
      detalhe:
        "Concluir tira a rodada do dia a dia e encerra os links dos fornecedores.",
      travando: false,
    });
  }

  return pendencias;
}

/**
 * A visão por fornecedor — documento mestre, 6.3.
 *
 * A tabela de fornecedores conta a comunicação: enviado, abriu, respondeu. Não
 * conta o comércio — quanto cada um cotou e quanto levou. É a leitura que
 * responde "com quem eu estou comprando nesta rodada", e ela não existia.
 *
 * Uma consulta só, e os agrupamentos são feitos aqui: são poucas linhas (itens
 * × fornecedores de uma rodada) e trazer bruto evita uma segunda RPC só para
 * somar o que o Postgres já teria que varrer de qualquer forma.
 */
export type ResumoDoFornecedor = {
  supplierId: string;
  itensEscolhidos: number;
  valorEscolhido: number;
  confirmados: number;
};

export const carregarResumoPorFornecedor = cache(
  async (roundId: string): Promise<Map<string, ResumoDoFornecedor>> => {
    const company = await requireActiveCompany();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("purchase_allocations")
      .select("supplier_id, allocated_quantity, selected_price, status")
      .eq("company_id", company.companyId)
      .eq("purchase_round_id", roundId)
      .in("status", ["draft", "confirmed"]);

    if (error) {
      throw new Error(`Falha ao resumir por fornecedor: ${error.message}`);
    }

    const resumo = new Map<string, ResumoDoFornecedor>();
    for (const a of data ?? []) {
      const atual = resumo.get(a.supplier_id) ?? {
        supplierId: a.supplier_id,
        itensEscolhidos: 0,
        valorEscolhido: 0,
        confirmados: 0,
      };
      atual.itensEscolhidos += 1;
      atual.valorEscolhido +=
        Number(a.allocated_quantity) * Number(a.selected_price);
      if (a.status === "confirmed") atual.confirmados += 1;
      resumo.set(a.supplier_id, atual);
    }
    return resumo;
  },
);
