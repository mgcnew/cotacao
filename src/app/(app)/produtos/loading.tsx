import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /produtos: o catálogo é largo, sete colunas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={7} />
    </PageSkeleton>
  );
}
