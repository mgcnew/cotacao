import { Suspense } from "react";

import {
  CardSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import {
  AcoesDaRodada,
  CorpoDaRodada,
  descreverRodada,
} from "@/components/rounds/round-central";
import { DialogBody } from "@/components/ui/dialog";
import { carregarRodada, carregarRodadaBasica } from "@/features/rounds/central";

/**
 * A Central da Rodada por cima da lista de compras.
 *
 * Esta é a rota interceptada: quem clica numa rodada em `/compras` continua em
 * `/compras`, com a tabela atrás, e a Central abre por cima. A URL muda para
 * `/compras/<id>` mesmo assim — então F5, link colado e favorito caem na
 * página inteira de `compras/[id]/page.tsx`, com o mesmo conteúdo.
 *
 * POR QUE TRÊS FRONTEIRAS DE ESPERA
 *
 * A casca do modal não espera por nada: ela é o que precisa aparecer no mesmo
 * instante do clique, senão a tela fica parada e o clique parece ter falhado.
 * O título vem de uma leitura só e chega primeiro; o miolo, que são cinco,
 * chega depois, com o esqueleto no lugar. As três leituras compartilham o
 * mesmo `cache()`, então o banco é lido uma vez.
 */
export default async function RodadaEmModal({
  params,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;

  return (
    <RouteModal
      titulo={
        <Suspense fallback={<span className="bg-surface-muted block h-5 w-48 animate-pulse rounded" />}>
          <Titulo id={id} />
        </Suspense>
      }
      descricao={
        <Suspense fallback={<span className="bg-surface-muted mt-1 block h-4 w-72 animate-pulse rounded" />}>
          <Descricao id={id} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <DialogBody className="flex flex-col gap-4">
            <SectionTitleSkeleton lines={2} />
            <CardSkeleton lines={3} />
            <TableSkeleton rows={4} columns={4} />
          </DialogBody>
        }
      >
        <Conteudo id={id} />
      </Suspense>
    </RouteModal>
  );
}

async function Titulo({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  return <>{round?.title ?? "Rodada"}</>;
}

async function Descricao({ id }: { id: string }) {
  const dados = await carregarRodada(id);
  if (!dados) return <>Esta rodada não existe mais.</>;
  return <>{descreverRodada(dados)}</>;
}

/**
 * Rodada apagada não vira 404 aqui: um `notFound()` dentro da vaga trocaria a
 * lista inteira pela tela de erro. Dentro do modal, a notícia cabe em uma
 * frase, e fechar devolve a lista.
 */
async function Conteudo({ id }: { id: string }) {
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <AcoesDaRodada dados={dados} />
      </div>

      <CorpoDaRodada dados={dados} />
    </DialogBody>
  );
}
