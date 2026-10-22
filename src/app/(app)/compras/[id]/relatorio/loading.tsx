import {
  CardSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do relatório da cotação: cabeçalho, os totais e as tabelas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton
        count={4}
        className="mb-4 grid-cols-2 gap-2 sm:mb-6 sm:gap-3"
      />
      <div className="mb-4">
        <CardSkeleton lines={3} />
      </div>
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
