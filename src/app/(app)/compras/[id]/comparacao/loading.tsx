import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca da comparação: a matriz de produtos por fornecedor. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-full">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </PageSkeleton>
  );
}
