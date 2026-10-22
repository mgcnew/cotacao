import {
  CardSkeleton,
  MetricsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Casca de /recebimentos: cabeçalho, os números e as listas de entregas.
 *
 * É a tela do dia a dia de quem confere mercadoria e a que mais consulta o
 * banco (quadro de entregas, preços a confirmar e histórico recente) — por isso
 * a que mais ganha em mostrar a forma antes dos dados.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <MetricsSkeleton
        count={5}
        className="mb-6 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5"
      />
      <section className="mb-8">
        <SectionTitleSkeleton lines={2} />
        <div className="flex flex-col gap-3">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </section>
    </PageSkeleton>
  );
}
