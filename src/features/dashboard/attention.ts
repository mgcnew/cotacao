import "server-only";

import {
  DIAS_DE_FALHA,
  getDashboardSnapshot,
  type DashboardSnapshot,
} from "@/features/dashboard/snapshot";

/**
 * Central de Atenção — documento mestre, 13.2.
 *
 * A pergunta que a página responde é "o que precisa de mim agora?". Cada item
 * daqui é uma CONDIÇÃO que persiste, não um evento que passou: a diferença
 * para o sino de notificações é essa. Pedido atrasado, por exemplo, nunca vira
 * notificação — a 0023 explica que atraso é condição de tempo, e só um lugar
 * que consulta o estado atual consegue mostrá-lo.
 *
 * Três regras que valem para todos os itens:
 *
 *  1. cada um leva à ação, e não só informa — por isso todos têm `href`, e ele
 *     aponta para o registro específico quando há apenas um;
 *  2. cada um exige a permissão de quem poderia agir. Esconder é cortesia,
 *     não segurança: quem contorna a tela esbarra na RLS do mesmo jeito;
 *  3. quantidade zero não vira item. Lista de pendências com "0 pendências"
 *     é ruído, e ruído ninguém lê.
 *
 * As contagens NÃO são feitas aqui. Eram nove consultas, uma por sonda, e cada
 * uma custava uma viagem de ~230 ms à outra ponta do continente. Hoje vêm todas
 * de `getDashboardSnapshot`, e este arquivo faz o que sempre foi o seu trabalho
 * de verdade: decidir o que merece virar item e como ele é escrito.
 */

export type AttentionItem = {
  key: string;
  title: string;
  hint: string;
  count: number;
  severity: "high" | "normal";
  href: string;
  actionLabel: string;
};

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Para onde o item leva.
 *
 * Com um caso só, vai direto ao registro — é o clique a menos que separa
 * "descobri a pendência" de "estou resolvendo". Com dois ou mais, a lista
 * filtrada, porque escolher um deles seria escolher pela pessoa.
 */
function destino(count: number, id: string | null, lista: string): string {
  return count === 1 && id ? `/pedidos/${id}` : lista;
}

export async function getAttentionItems(
  companyId: string,
  permissions: Set<string>,
): Promise<AttentionItem[]> {
  const s = await getDashboardSnapshot(companyId);

  const itens: AttentionItem[] = [];
  const podeVerPedidos = permissions.has("order.view");
  const podeVerRodadas = permissions.has("purchase_round.view");

  if (podeVerPedidos) {
    if (s.pedidosAtrasados > 0) {
      itens.push({
        key: "pedidos-atrasados",
        title: plural(s.pedidosAtrasados, "pedido atrasado", "pedidos atrasados"),
        hint:
          s.pedidosAtrasados === 1
            ? `Prazo vencido há ${plural(s.atrasoPiorDias, "dia", "dias")}.`
            : `O mais antigo está vencido há ${plural(s.atrasoPiorDias, "dia", "dias")}.`,
        count: s.pedidosAtrasados,
        severity: "high",
        href: destino(
          s.pedidosAtrasados,
          s.atrasoOrderId,
          "/pedidos?situacao=atrasados",
        ),
        actionLabel: "Cobrar entrega",
      });
    }

    if (s.entregasHoje > 0) {
      itens.push({
        key: "entrega-hoje",
        title:
          plural(s.entregasHoje, "entrega prevista", "entregas previstas") +
          " para hoje",
        hint: "Dar entrada assim que a mercadoria chegar.",
        count: s.entregasHoje,
        severity: "normal",
        href: destino(
          s.entregasHoje,
          s.entregaHojeOrderId,
          "/pedidos?situacao=entrega_hoje",
        ),
        actionLabel: "Ver pedidos do dia",
      });
    }

    if (s.pedidosRascunho > 0) {
      itens.push({
        key: "pedidos-rascunho",
        title: plural(
          s.pedidosRascunho,
          "pedido em rascunho",
          "pedidos em rascunho",
        ),
        hint: "Gerado, mas ainda não enviado ao fornecedor.",
        count: s.pedidosRascunho,
        severity: "normal",
        href: destino(
          s.pedidosRascunho,
          s.rascunhoOrderId,
          "/pedidos?situacao=draft",
        ),
        actionLabel: "Enviar",
      });
    }

    if (s.revisoesPendentes > 0) {
      itens.push({
        key: "revisoes-pendentes",
        title:
          plural(s.revisoesPendentes, "revisão aguardando", "revisões aguardando") +
          " envio",
        hint: "O fornecedor ainda está com a versão anterior do pedido.",
        count: s.revisoesPendentes,
        severity: "high",
        href: destino(
          s.revisoesPendentes,
          s.revisaoOrderId,
          "/pedidos?situacao=abertos",
        ),
        actionLabel: "Enviar revisão",
      });
    }

    if (s.falhasEnvio > 0) {
      itens.push({
        key: "falhas-de-envio",
        title: plural(s.falhasEnvio, "envio que falhou", "envios que falharam"),
        hint: `Nos últimos ${DIAS_DE_FALHA} dias. A mensagem não chegou ao fornecedor.`,
        count: s.falhasEnvio,
        severity: "high",
        href: "/pedidos?situacao=abertos",
        actionLabel: "Reenviar",
      });
    }
  }

  if (
    permissions.has("commercial_divergence.view") &&
    s.divergenciasComerciais > 0
  ) {
    itens.push({
      key: "divergencias-comerciais",
      title:
        plural(s.divergenciasComerciais, "divergência", "divergências") +
        " de preço a resolver",
      hint: "A nota veio diferente do combinado e ninguém decidiu o que fazer.",
      count: s.divergenciasComerciais,
      severity: "high",
      href: destino(
        s.divergenciasComerciais,
        s.divergenciaComercialOrderId,
        "/pedidos",
      ),
      actionLabel: "Tratar",
    });
  }

  if (permissions.has("order.revise") && s.divergenciasFornecedor > 0) {
    itens.push({
      key: "divergencias-fornecedor",
      title:
        plural(
          s.divergenciasFornecedor,
          "divergência apontada",
          "divergências apontadas",
        ) + " pelo fornecedor",
      hint: "Enquanto não for resolvida, o pedido não avança para entrega.",
      count: s.divergenciasFornecedor,
      severity: "high",
      href: destino(
        s.divergenciasFornecedor,
        s.divergenciaFornecedorOrderId,
        "/pedidos?situacao=abertos",
      ),
      actionLabel: "Responder",
    });
  }

  if (podeVerRodadas) {
    itens.push(...pendenciasDeRodada(s));
  }

  // Urgente primeiro; dentro da mesma urgência, o que tem mais casos.
  return itens.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.count - a.count;
  });
}

/** As três pendências que saem do progresso das rodadas em andamento. */
function pendenciasDeRodada(s: DashboardSnapshot): AttentionItem[] {
  const itens: AttentionItem[] = [];

  const pendentes = s.rodadas.filter((r) => r.suppliersPending > 0);
  if (pendentes.length > 0) {
    const total = pendentes.reduce((soma, r) => soma + r.suppliersPending, 0);
    itens.push({
      key: "fornecedores-sem-resposta",
      title: plural(
        total,
        "fornecedor sem responder",
        "fornecedores sem responder",
      ),
      hint:
        pendentes.length === 1
          ? `Na rodada "${pendentes[0].title}".`
          : `Em ${plural(pendentes.length, "rodada", "rodadas")} em andamento.`,
      count: total,
      severity: "normal",
      href:
        pendentes.length === 1 ? `/compras/${pendentes[0].roundId}` : "/compras",
      actionLabel: "Cobrar resposta",
    });
  }

  // Todo mundo respondeu e nenhum pedido saiu: a rodada está esperando alguém
  // decidir a compra.
  const prontas = s.rodadas.filter(
    (r) =>
      r.totalSuppliers > 0 && r.suppliersPending === 0 && r.ordersCreated === 0,
  );
  if (prontas.length > 0) {
    itens.push({
      key: "rodadas-para-fechar",
      title:
        plural(prontas.length, "rodada pronta", "rodadas prontas") +
        " para fechar",
      hint: "Todos responderam e nenhum pedido foi gerado ainda.",
      count: prontas.length,
      severity: "high",
      href:
        prontas.length === 1
          ? `/compras/${prontas[0].roundId}/alocacao`
          : "/compras",
      actionLabel: "Decidir compra",
    });
  }

  // Só faz sentido cobrar alocação onde já existe resposta para comparar;
  // rodada recém-enviada tem tudo em aberto, e isso não é pendência. A conta
  // está na RPC, que aplica o mesmo recorte.
  const comResposta = s.rodadas.filter((r) => r.suppliersCompleted > 0);
  if (s.itensSemAlocacao > 0 && comResposta.length > 0) {
    itens.push({
      key: "itens-sem-alocacao",
      title:
        plural(s.itensSemAlocacao, "item sem decisão", "itens sem decisão") +
        " de compra",
      hint: "Já há resposta de fornecedor, mas ninguém escolheu de quem comprar.",
      count: s.itensSemAlocacao,
      severity: "normal",
      href:
        comResposta.length === 1
          ? `/compras/${comResposta[0].roundId}/alocacao`
          : "/compras",
      actionLabel: "Alocar",
    });
  }

  return itens;
}
