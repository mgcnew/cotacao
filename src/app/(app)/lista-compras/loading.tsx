import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /lista-compras: cabeçalho, filtros e a lista de itens. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <FilterBarSkeleton fields={3} />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
