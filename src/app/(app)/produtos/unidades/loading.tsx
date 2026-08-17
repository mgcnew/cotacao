import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca das unidades de medida. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-4xl">
      <PageHeaderSkeleton />
      <TableSkeleton rows={5} columns={3} />
    </PageSkeleton>
  );
}
