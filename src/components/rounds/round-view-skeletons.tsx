import {
  CardSkeleton,
  ListSkeleton,
  MetricsSkeleton,
  PageSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O esqueleto de cada aba da rodada, com o desenho da aba — não um genérico.
 *
 * Antes uma troca de aba não mostrava esqueleto nenhum (a página inteira
 * esperava os dados) e, quando mostrava, era o da Central de montagem: três
 * tabelas que não se parecem com nenhuma das telas. Agora o que aparece no
 * clique é a forma do que vai chegar: quem troca para Respostas vê as três
 * métricas e a tabela; para Distribuição, os cartões; para Produtos, os grupos.
 */
export function EsqueletoDaAba({
  view,
}: {
  view: "responses" | "distribution" | "scope";
}) {
  if (view === "distribution") {
    return (
      <PageSkeleton>
        <SectionTitleSkeleton lines={2} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </PageSkeleton>
    );
  }

  if (view === "scope") {
    return (
      <PageSkeleton>
        <SectionTitleSkeleton lines={2} />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </PageSkeleton>
    );
  }

  return (
    <PageSkeleton>
      <SectionTitleSkeleton lines={2} />
      <MetricsSkeleton
        count={3}
        className="mb-4 grid-cols-3 gap-2 sm:mb-5 sm:gap-3 lg:grid-cols-3"
      />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <ListSkeleton rows={4} />
    </PageSkeleton>
  );
}

/**
 * A alternância "Comparar respostas | Decidir compra" nos esqueletos da
 * Decisão. Ela vive no corpo da página; sem este espaço reservado ela entrava
 * depois do carregamento e empurrava todo o conteúdo para baixo.
 */
export function EsqueletoDaFerramenta() {
  return (
    <div className="mb-5 flex items-center gap-2" aria-hidden>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-36 rounded-lg" />
      <Skeleton className="h-9 w-32 rounded-lg" />
    </div>
  );
}

/** Reexportado para as páginas da Decisão comporem o esqueleto inteiro. */
export { TableSkeleton };
