import {
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";

/**
 * A casca de qualquer tela do app que não tenha uma própria.
 *
 * Ela é o piso, não o teto: existe para que NENHUMA navegação fique com a tela
 * anterior congelada esperando o servidor. As telas mais visitadas têm o seu
 * `loading.tsx` ao lado do `page.tsx`, desenhado no formato delas — este atende
 * o resto, e atende as telas novas no dia em que nascerem.
 *
 * Vale mais do que parece: sem um `loading.tsx`, o Next nem prefetch faz de
 * rota dinâmica, porque não teria o que mostrar antes do dado. Com ele, a casca
 * já está no cliente quando o clique acontece, e a troca de tela é imediata.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <TableSkeleton rows={5} />
    </PageSkeleton>
  );
}
