import {
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Esqueleto do miolo da rodada. Cabeçalho e abas vêm do `layout.tsx`, que não
 * espera por isto — só o corpo mostra que está carregando.
 */
export default function Loading() {
  return (
    <>
      <section className="mb-8">
        <SectionTitleSkeleton lines={2} />
        <TableSkeleton rows={2} columns={3} />
      </section>

      <section className="mb-8">
        <SectionTitleSkeleton lines={2} />
        <TableSkeleton rows={5} columns={5} />
      </section>

      <section>
        <SectionTitleSkeleton lines={2} />
        <TableSkeleton rows={3} columns={5} />
      </section>
    </>
  );
}
