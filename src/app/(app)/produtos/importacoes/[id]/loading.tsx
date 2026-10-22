import {
  CardSkeleton,
  FilterBarSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de uma importação: cabeçalho, os totais, filtros e as linhas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton
        count={4}
        className="mb-4 grid-cols-2 gap-2 sm:mb-6 sm:gap-3"
      />
      <div className="mb-4">
        <CardSkeleton lines={2} />
      </div>
      <FilterBarSkeleton fields={3} />
      <TableSkeleton rows={8} columns={6} />
    </PageSkeleton>
  );
}
