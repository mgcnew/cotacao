import {
  PageHeaderSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * Casca da Central da Rodada: cabeçalho, grupos, produtos e fornecedores.
 *
 * É a tela mais pesada do sistema — rodada, grupos, itens, fornecedores
 * convidados e o progresso de cada um. Também é a que mais se abre e fecha
 * durante uma cotação, e por isso é a que mais ganha com a casca vindo antes.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />

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
    </PageSkeleton>
  );
}
