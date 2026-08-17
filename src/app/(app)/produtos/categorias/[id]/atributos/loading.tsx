import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca dos atributos de uma categoria. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-4xl">
      <PageHeaderSkeleton />
      <TableSkeleton rows={4} columns={4} />
    </PageSkeleton>
  );
}
