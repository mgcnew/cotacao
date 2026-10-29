import {
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
      <div className="border-border mb-4 h-10 border-b" />
      <TableSkeleton rows={6} columns={5} />
    </PageSkeleton>
  );
}
