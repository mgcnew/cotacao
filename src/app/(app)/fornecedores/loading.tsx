import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /fornecedores: cabeçalho e a lista de quatro colunas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={4} />
    </PageSkeleton>
  );
}
