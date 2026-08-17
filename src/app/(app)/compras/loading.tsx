import {
  FilterBarSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /compras: cabeçalho, filtros, quatro números e a lista. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <MetricsSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
