/**
 * Situação da rodada, em português e com cor.
 *
 * Mora em módulo próprio, e não junto das server actions, porque um arquivo
 * `"use server"` só pode exportar funções assíncronas — mesmo motivo do
 * `channels.ts` das negociações.
 *
 * Estava duplicado na lista de Compras e na Central da Rodada, com o risco de
 * sempre: duas listas de rótulos que envelhecem em ritmos diferentes.
 */

export const ROUND_STATUS_LABEL: Record<string, string> = {
  draft: "Preparação",
  active: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/** Situação do grupo dentro da rodada — documento mestre, 6. */
export const GROUP_STATUS_LABEL: Record<string, string> = {
  draft: "Preparação",
  open: "Aberto",
  closed: "Fechado",
  cancelled: "Cancelado",
};

/**
 * Situação comercial do item — documento mestre, 16.5.
 *
 * A tabela da rodada mostrava só "Aberto" ou "Removido da rodada", olhando um
 * booleano. Item já alocado, já confirmado para compra ou encerrado sem compra
 * aparecia como "Aberto" — a coluna existia e informava errado.
 */
export const ITEM_STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  allocated: "Alocado",
  confirmed: "Compra confirmada",
  closed_without_purchase: "Encerrado sem compra",
  cancelled: "Removido da rodada",
};

export type BadgeTone = "default" | "secondary" | "outline" | "destructive";

/**
 * Antes tudo era `secondary`: rodada cancelada e rodada em preparação tinham a
 * mesma cor, o que faz a coluna de situação existir sem informar.
 */
export function roundStatusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "default";
    case "cancelled":
      return "destructive";
    case "draft":
      return "outline";
    default:
      return "secondary";
  }
}

/**
 * O próximo passo da rodada, do ponto de vista de quem compra.
 *
 * Mesmo desenho do `orderNextStep` dos pedidos: a lista mostrava só o estado, e
 * estado não diz o que fazer. A ação continua morando na tela da rodada; isto
 * apenas a anuncia.
 */
export type RoundNextStep = {
  label: string;
  shortLabel: string;
  permission: string | null;
  pending: boolean;
  /** Caminho relativo à rodada, ou vazio para a própria página dela. */
  path: string;
};

export function roundNextStep(
  status: string,
  progress: { suppliersPending: number; ordersCreated: number },
): RoundNextStep {
  if (status === "draft") {
    return {
      label: "Montar e iniciar",
      shortLabel: "Montar",
      permission: "purchase_round.update",
      pending: true,
      path: "",
    };
  }

  if (status === "active") {
    if (progress.suppliersPending > 0) {
      return {
        label: "Cobrar respostas",
        shortLabel: "Cobrar",
        permission: "purchase_round.send",
        pending: true,
        path: "",
      };
    }
    if (progress.ordersCreated === 0) {
      return {
        label: "Decidir compra",
        shortLabel: "Decidir",
        permission: "purchase_allocation.create",
        pending: true,
        path: "/alocacao",
      };
    }
    // Todos concluíram a resposta e o pedido saiu: o que falta é dizer que acabou. Sem
    // este passo a rodada ficava em "Em andamento" para sempre, e a lista de
    // compras juntava o trabalho de três meses atrás com o de hoje.
    return {
      label: "Concluir rodada",
      shortLabel: "Concluir",
      permission: "purchase_round.close",
      pending: true,
      path: "",
    };
  }

  // Concluída ou cancelada: a rodada acabou, e a porta é só de leitura.
  return {
    label: "Abrir",
    shortLabel: "Abrir",
    permission: null,
    pending: false,
    path: "",
  };
}
