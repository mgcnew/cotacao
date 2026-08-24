export const PAGE_SIZE_OPTIONS = [10, 20, 30] as const;

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
        : 10;
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
