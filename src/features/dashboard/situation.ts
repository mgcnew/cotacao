import "server-only";

import type { FirstStep } from "@/components/dashboard/first-steps";
import { getDashboardSnapshot } from "@/features/dashboard/snapshot";

/**
 * Como estão as compras em andamento — documento mestre, 13.1.
 *
 * A Central de Atenção responde "o que preciso fazer"; isto responde "como
 * está". São coisas diferentes e ambas cabem na mesma tela: um pedido atrasado
 * é pendência, mas saber que há doze pedidos em aberto é situação, e não vira
 * tarefa de ninguém.
 *
 * Os números vêm do mesmo retrato que alimenta a Central de Atenção, lido uma
 * vez por render — o `cache()` do React garante isso. Eram seis consultas a
 * mais, e o dado é o mesmo.
 */

export type SituationSummary = {
  rondasAtivas: number;
  /** Título da rodada quando há só uma — dá nome ao que está acontecendo. */
  rodadaUnica: { id: string; title: string } | null;
  fornecedoresPendentes: number;
  fornecedoresTotal: number;
  fornecedoresResponderam: number;
  pedidosEmAberto: number;
  pedidosAtrasados: number;
};

export async function getSituationSummary(
  companyId: string,
  permissions: Set<string>,
): Promise<SituationSummary> {
  const s = await getDashboardSnapshot(companyId);
  const podeVerRodadas = permissions.has("purchase_round.view");
  const podeVerPedidos = permissions.has("order.view");

  const ativas = podeVerRodadas ? s.rodadas : [];
  const unica = ativas.length === 1 ? ativas[0] : null;

  return {
    rondasAtivas: ativas.length,
    rodadaUnica: unica ? { id: unica.roundId, title: unica.title } : null,
    fornecedoresPendentes: ativas.reduce(
      (soma, r) => soma + r.suppliersPending,
      0,
    ),
    fornecedoresTotal: ativas.reduce(
      (soma, r) => soma + r.totalSuppliers,
      0,
    ),
    fornecedoresResponderam: ativas.reduce(
      (soma, r) => soma + r.suppliersCompleted,
      0,
    ),
    pedidosEmAberto: podeVerPedidos ? s.pedidosEmAberto : 0,
    pedidosAtrasados: podeVerPedidos ? s.pedidosAtrasados : 0,
  };
}

/**
 * Os passos até a primeira cotação.
 *
 * A ordem é a que o sistema exige, não uma sugestão: item de cotação grava as
 * unidades do produto, e rodada sem fornecedor não tem a quem perguntar preço.
 * Cada passo é marcado como feito olhando o que já existe — a lista não pede
 * duas vezes o que a pessoa já fez.
 *
 * Passo que a pessoa não tem permissão de executar fica de fora: mandar alguém
 * a uma tela que vai recusá-la é pior do que omitir o passo.
 */
export async function getFirstSteps(
  companyId: string,
  permissions: Set<string>,
): Promise<FirstStep[]> {
  const s = await getDashboardSnapshot(companyId);
  const passos: FirstStep[] = [];

  if (permissions.has("product.view")) {
    passos.push({
      label: "Cadastrar produtos",
      hint: "O item da cotação grava as unidades do cadastro do produto.",
      href: "/produtos",
      done: s.produtosAtivos > 0,
    });
  }

  if (permissions.has("supplier.view")) {
    passos.push({
      label: "Cadastrar fornecedores",
      hint: "Com contato de WhatsApp, é para lá que a cotação vai.",
      href: "/fornecedores",
      done: s.fornecedoresAtivos > 0,
    });
  }

  if (permissions.has("purchase_round.create")) {
    passos.push({
      label: "Abrir a primeira rodada de compras",
      hint: "Reúne os produtos, convida os fornecedores e compara os preços.",
      href: "/compras/nova",
      done: s.rodadasTotal > 0,
    });
  }

  if (permissions.has("order.create")) {
    passos.push({
      label: "Ou lançar um pedido direto",
      hint: "Para a compra que já foi fechada por telefone, sem cotar.",
      href: "/pedidos/novo",
      done: false,
    });
  }

  return passos;
}
