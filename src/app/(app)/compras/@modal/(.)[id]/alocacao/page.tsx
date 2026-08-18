import { Suspense } from "react";

import { CardSkeleton } from "@/components/layout/page-skeleton";
import { AlocacaoConteudo } from "@/components/rounds/round-allocation";
import { NavegacaoDaRodada } from "@/components/rounds/round-nav";
import { DialogBody } from "@/components/ui/dialog";
import { carregarAlocacao } from "@/features/rounds/alocacao";

/** A decisão de compra por cima da lista. Ver o irmão `comparacao/page.tsx`. */
export default async function AlocacaoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <DialogBody className="flex flex-col gap-3">
          <NavegacaoDaRodada roundId={id} atual="alocacao" />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </DialogBody>
      }
    >
      <Conteudo id={id} />
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  const dados = await carregarAlocacao(id);

  return (
    <DialogBody>
      <NavegacaoDaRodada roundId={id} atual="alocacao" />
      {dados ? (
        <AlocacaoConteudo dados={dados} />
      ) : (
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Esta rodada não existe mais.
        </p>
      )}
    </DialogBody>
  );
}
