import {
  FilterBarSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /analises: filtros, os números do recorte e a tabela por fornecedor. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-5xl">
      <PageHeaderSkeleton action={false} />
      <FilterBarSkeleton />
      <MetricsSkeleton />
      <TableSkeleton rows={5} columns={5} />
    </PageSkeleton>
  );
}
