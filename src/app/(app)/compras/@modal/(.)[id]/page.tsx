import { Suspense } from "react";

import {
  CardSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import {
  AcoesDaRodada,
  CorpoDaRodada,
} from "@/components/rounds/round-central";
import { RoundModalContent, type RoundModalView } from "@/components/rounds/round-modal-content";
import { DialogBody } from "@/components/ui/dialog";
import { carregarRodada } from "@/features/rounds/central";

/**
 * A montagem/acompanhamento da rodada — a view padrão do modal.
 *
 * Só o miolo: a casca do diálogo mora no `layout.tsx` ao lado, e é o que faz
 * ir daqui para a comparação ou para a decisão trocar o conteúdo sem fechar
 * nada. As três views deste segmento dividem o mesmo `cache()`, então navegar
 * entre elas relê da rodada apenas o que a nova view precisa.
 */
export default async function RodadaEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const modalView: RoundModalView = view === "distribution" || view === "scope" ? view : "responses";

  return (
    <Suspense
      fallback={
        <DialogBody className="flex flex-col gap-4">
          <SectionTitleSkeleton lines={2} />
          <CardSkeleton lines={3} />
          <TableSkeleton rows={4} columns={4} />
        </DialogBody>
      }
    >
      <Conteudo id={id} view={modalView} />
    </Suspense>
  );
}

async function Conteudo({ id, view }: { id: string; view: RoundModalView }) {
  const dados = await carregarRodada(id);

  if (!dados) {
    return (
      <DialogBody>
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Não foi possível abrir esta rodada. Ela pode ter sido cancelada e
          removida enquanto a lista estava aberta.
        </p>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      {dados.emPreparacao ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2"><AcoesDaRodada dados={dados} showEdit={false} /></div>
          <CorpoDaRodada dados={dados} />
        </>
      ) : <RoundModalContent dados={dados} view={view} />}
    </DialogBody>
  );
}
