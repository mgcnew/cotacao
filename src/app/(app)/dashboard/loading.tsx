import {
  CardSkeleton,
  ListSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Casca do dashboard na ordem real da tela: a faixa de status, as prioridades
 * de hoje e, abaixo, o resultado do mês e a atividade.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />

      <div className="mb-5 flex gap-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-36" />
      </div>

      <div className="mb-6">
        <ListSkeleton rows={4} />
      </div>

      <section className="mt-6">
        <SectionTitleSkeleton />
        <MetricsSkeleton />
      </section>

      <section className="mt-6">
        <SectionTitleSkeleton />
        <CardSkeleton lines={4} />
      </section>
    </PageSkeleton>
  );
}
