import { Suspense } from "react";

import { HistoricoFornecedorContent } from "@/app/(app)/fornecedores/[id]/historico/page";
import { MetricsSkeleton, TableSkeleton } from "@/components/layout/page-skeleton";
import { DialogBody } from "@/components/ui/dialog";

/**
 * O histórico comercial dentro do modal do fornecedor.
 *
 * Não há `RouteModal` aqui: a casca mora no `layout.tsx` do segmento
 * interceptado e por isso NÃO remonta ao trocar de aba — o diálogo continua o
 * mesmo elemento, com o foco e a rolagem de fundo onde estavam.
 */
export default async function HistoricoFornecedorEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  return (
    <Suspense
      key={JSON.stringify(query)}
      fallback={
        <DialogBody className="flex flex-col gap-4">
          <MetricsSkeleton count={5} />
          <TableSkeleton rows={6} columns={5} />
        </DialogBody>
      }
    >
      <HistoricoFornecedorContent id={id} query={query} emModal />
    </Suspense>
  );
}
