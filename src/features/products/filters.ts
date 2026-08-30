export type ProductListFilters = {
  busca: string;
  status: "ativos" | "inativos" | null;
  categoriaId: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseProductListFilters(
  params: SearchParams,
): ProductListFilters {
  const busca = (first(params.busca) ?? "").trim();
  const rawStatus = first(params.status);
  const rawCategory = first(params.categoria);

  return {
    busca,
    status:
      rawStatus === "ativos" || rawStatus === "inativos" ? rawStatus : null,
    categoriaId:
      rawCategory &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawCategory,
      )
        ? rawCategory
        : null,
  };
}

export function countProductListFilters(filters: ProductListFilters) {
  return (
    Number(Boolean(filters.busca)) +
    Number(Boolean(filters.status)) +
    Number(Boolean(filters.categoriaId))
  );
}
