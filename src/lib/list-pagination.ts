export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;

/** Vinte cabe inteiro na maioria dos monitores e, onde não cabe, sobra uma
 * rolagem curta dentro da própria tabela — com o rodapé sempre à vista. É um
 * número, não uma medição: o servidor devolve a mesma página para todo mundo,
 * então um link de `?pagina=3` mostra os mesmos registros em qualquer tela. */
export const DEFAULT_PAGE_SIZE = 20;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListPagination(
  params: Record<string, string | string[] | undefined>,
  total: number,
  options?: {
    pageSizeRange?: { min: number; max: number; default: number };
  },
) {
  const requestedSize = Number(first(params.por_pagina));
  const acceptedRequestedSize = PAGE_SIZE_OPTIONS.includes(
    requestedSize as (typeof PAGE_SIZE_OPTIONS)[number],
  );
  const range = options?.pageSizeRange;
  const acceptedRangeSize =
    range &&
    Number.isInteger(requestedSize) &&
    requestedSize >= range.min &&
    requestedSize <= range.max;
  const pageSize = acceptedRangeSize
    ? requestedSize
    : range
      ? range.default
      : acceptedRequestedSize
        ? requestedSize
        : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(first(params.pagina));
  const page = Math.min(
    Math.max(Number.isInteger(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  );
  const start = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    totalPages,
    start,
    end: Math.min(start + pageSize, total),
  };
}

export function normalizeListSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}
