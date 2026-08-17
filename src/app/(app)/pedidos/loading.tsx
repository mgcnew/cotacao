import {
  FilterBarSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /pedidos. `max-w-5xl` para bater com a largura da tela real. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-5xl">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <MetricsSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
