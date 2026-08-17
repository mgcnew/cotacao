import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do pedido: cabeçalho, a revisão vigente e o histórico. */
export default function Loading() {
  return (
    <PageSkeleton className="max-w-4xl">
      <PageHeaderSkeleton />

      <div className="mb-6">
        <CardSkeleton lines={5} />
      </div>

      <section className="mb-8">
        <SectionTitleSkeleton />
        <CardSkeleton lines={3} />
      </section>

      <section>
        <SectionTitleSkeleton />
        <CardSkeleton lines={2} />
      </section>
    </PageSkeleton>
  );
}
