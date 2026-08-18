import { Suspense } from "react";

import { TableSkeleton } from "@/components/layout/page-skeleton";
import { ComparacaoConteudo } from "@/components/rounds/round-comparison";
import { NavegacaoDaRodada } from "@/components/rounds/round-nav";
import { DialogBody } from "@/components/ui/dialog";
import { carregarComparacao } from "@/features/rounds/comparacao";

/**
 * A comparação por cima da lista, dentro do modal da rodada.
 *
 * Não há `RouteModal` aqui: a casca mora no `layout.tsx` do segmento
 * interceptado, e por isso ela NÃO remonta ao trocar de view — o diálogo
 * continua o mesmo elemento, com o foco e a rolagem de fundo onde estavam.
 * Só este miolo é substituído, com esqueleto próprio enquanto chega.
 */
export default async function ComparacaoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <DialogBody>
          <NavegacaoDaRodada roundId={id} atual="comparacao" />
          <TableSkeleton rows={5} columns={4} />
        </DialogBody>
      }
    >
      <Conteudo id={id} />
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  const dados = await carregarComparacao(id);

  return (
    <DialogBody>
      <NavegacaoDaRodada roundId={id} atual="comparacao" />
      {dados ? (
        <ComparacaoConteudo dados={dados} />
      ) : (
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Esta rodada não existe mais.
        </p>
      )}
    </DialogBody>
  );
}
