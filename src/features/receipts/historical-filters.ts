/**
 * Recorte da lista de NF-e históricas.
 *
 * Mesmo desenho dos filtros de Pedidos: mora na URL, é um GET comum e funciona
 * sem JavaScript — "as notas do frigorífico de setembro ainda por conciliar"
 * vira um link que dá para guardar e mandar para outra pessoa.
 */

export const HISTORICAL_STATUS_LABEL = {
  draft: "Conciliar",
  posted: "No histórico",
  transferred: "Em recebimento",
  voided: "Descartada",
} as const;

export type HistoricalStatus = keyof typeof HISTORICAL_STATUS_LABEL;

/**
 * Recorte que não é situação do banco: notas ainda no histórico que caem na
 * janela de um pedido sem entrada do mesmo fornecedor.
 */
export const LOOKS_LIKE_ORDER = "parece_pedido";
export type HistoricalSituation = HistoricalStatus | typeof LOOKS_LIKE_ORDER;

export type HistoricalNfeFilters = {
  situacao: HistoricalSituation | null;
  fornecedorId: string | null;
  de: string | null;
  ate: string | null;
  busca: string | null;
};

export const EMPTY_HISTORICAL_FILTERS: HistoricalNfeFilters = {
  situacao: null,
  fornecedorId: null,
  de: null,
  ate: null,
  busca: null,
};

function texto(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const limpo = (raw ?? "").trim();
  return limpo === "" ? null : limpo;
}

// Id que não é UUID chega ao Postgres e derruba a página com "invalid input
// syntax"; filtro inválido é filtro ignorado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function data(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function parseHistoricalNfeFilters(
  searchParams: Record<string, string | string[] | undefined>,
): HistoricalNfeFilters {
  const situacao = texto(searchParams.situacao);
  const fornecedor = texto(searchParams.fornecedor);
  // A busca vai para dentro de um `or()` do PostgREST, onde vírgula, parêntese
  // e aspas são sintaxe. Fora eles, nenhum número de nota, chave ou nome de
  // emitente perde o sentido.
  const busca = texto(searchParams.busca)
    ?.replace(/[,()"'\\%*]/g, " ")
    .trim();
  return {
    situacao:
      situacao === LOOKS_LIKE_ORDER
        ? LOOKS_LIKE_ORDER
        : situacao && situacao in HISTORICAL_STATUS_LABEL
          ? (situacao as HistoricalStatus)
          : null,
    fornecedorId: fornecedor && UUID.test(fornecedor) ? fornecedor : null,
    de: data(searchParams.de),
    ate: data(searchParams.ate),
    busca: busca ? busca.slice(0, 80) : null,
  };
}

/** Quantos filtros estão valendo — é o número que aparece no botão. */
export function contarHistoricalNfeFilters(f: HistoricalNfeFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}
