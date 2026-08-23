import {
  CardSkeleton,
  ListSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Casca do dashboard na mesma hierarquia visual da central: resumo executivo,
 * prioridades com fluxo lateral e resultado financeiro.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />

      <section className="mb-6">
        <SectionTitleSkeleton />
        <MetricsSkeleton />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.75fr)]">
        <ListSkeleton rows={4} />
        <CardSkeleton lines={5} />
      </div>

      <section className="mt-6">
        <SectionTitleSkeleton />
        <MetricsSkeleton />
      </section>
    </PageSkeleton>
  );
}
