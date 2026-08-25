import {
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton count={4} />
      <TableSkeleton rows={7} columns={6} />
    </PageSkeleton>
  );
}
