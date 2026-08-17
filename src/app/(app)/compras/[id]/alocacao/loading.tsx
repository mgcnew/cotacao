import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca da decisão de compra: item a item, com o preço de cada fornecedor. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-4xl">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
