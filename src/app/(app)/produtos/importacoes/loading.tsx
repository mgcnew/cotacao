import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca das importações de planilha: cabeçalho, o envio e o histórico. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <div className="mb-6">
        <CardSkeleton lines={2} />
      </div>
      <TableSkeleton rows={5} columns={5} />
    </PageSkeleton>
  );
}
