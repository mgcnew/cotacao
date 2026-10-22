import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/** Casca do histórico fiscal: cabeçalho, o envio de XML e a lista de notas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <CardSkeleton lines={2} />
      <section className="mt-7">
        <SectionTitleSkeleton lines={1} />
        <TableSkeleton rows={7} columns={5} />
      </section>
    </PageSkeleton>
  );
}
