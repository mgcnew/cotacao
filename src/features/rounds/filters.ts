import "server-only";

import { ROUND_STATUS_LABEL } from "@/features/rounds/status";

/**
 * Recorte da lista de rodadas.
 *
 * Mesmo desenho dos filtros de Pedidos e das Análises: mora na URL, é um GET
 * comum e funciona sem JavaScript — o recorte vira link, e o botão de voltar
 * faz o que promete.
 */

/** Situação que não é um status do banco, e sim um jeito de olhar. */
export const SITUACOES_COMPOSTAS = {
  abertas: "Em aberto",
  aguardando: "Aguardando resposta",
} as const;

export type RoundFilters = {
  situacao: string | null;
  de: string | null;
  ate: string | null;
  busca: string | null;
};

const VAZIO: RoundFilters = {
  situacao: null,
  de: null,
  ate: null,
  busca: null,
};

function texto(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const limpo = (raw ?? "").trim();
  return limpo === "" ? null : limpo;
}

function data(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function situacao(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  const valida = raw in ROUND_STATUS_LABEL || raw in SITUACOES_COMPOSTAS;
  return valida ? raw : null;
}

/**
 * Busca por título.
 *
 * `%` e `_` são curingas do `ilike`: sem escapá-los, quem digitasse "50%"
 * estaria pedindo outra coisa ao banco. E a vírgula quebraria a sintaxe do
 * filtro do PostgREST.
 */
function busca(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return raw.slice(0, 80).replace(/[%_,]/g, " ");
}

export function parseRoundFilters(
  searchParams: Record<string, string | string[] | undefined>,
): RoundFilters {
  return {
    ...VAZIO,
    situacao: situacao(searchParams.situacao),
    de: data(searchParams.de),
    ate: data(searchParams.ate),
    busca: busca(searchParams.busca),
  };
}

export function hasAnyRoundFilter(f: RoundFilters): boolean {
  return contarRoundFilters(f) > 0;
}

/** Quantos filtros estão valendo — é o número que aparece no botão. */
export function contarRoundFilters(f: RoundFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}
