import {
  ListSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Casca do dashboard, na mesma ordem da tela: pendências, depois números.
 *
 * A ordem importa mesmo no esqueleto — é ela que ensina onde olhar. Se o
 * carregamento mostrasse os números primeiro e a lista depois, o olho iria para
 * o lugar errado e voltaria quando o dado chegasse.
 */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-5xl">
      <PageHeaderSkeleton action={false} />

      <section className="mb-8">
        <SectionTitleSkeleton lines={2} />
        <ListSkeleton rows={3} />
      </section>

      <section className="mb-8">
        <SectionTitleSkeleton />
        <MetricsSkeleton />
      </section>
    </PageSkeleton>
  );
}
