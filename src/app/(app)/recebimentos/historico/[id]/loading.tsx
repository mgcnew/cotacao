import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de uma nota do histórico: cabeçalho, três dados e os itens. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="mb-6">
        <CardSkeleton lines={2} />
      </div>
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
