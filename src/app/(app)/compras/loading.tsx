import {
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca de /compras: cabeçalho, quatro números e a lista. Os filtros agora
 *  moram atrás de um botão do cabeçalho, então não há barra a fingir aqui. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton className="mb-4 grid-cols-2 gap-2 sm:mb-6 sm:gap-3" />
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
