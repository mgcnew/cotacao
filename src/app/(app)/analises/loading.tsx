import {
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Casca de /analises: período e filtros, os números do recorte e a tabela por fornecedor. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-8 w-full sm:w-80" />
        <Skeleton className="hidden h-8 w-20 sm:block" />
      </div>
      <MetricsSkeleton />
      <TableSkeleton rows={5} columns={5} />
    </PageSkeleton>
  );
}
