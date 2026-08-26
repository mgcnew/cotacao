import { Suspense } from "react";

import { RouteModal } from "@/components/layout/route-modal";
import { descreverRodada } from "@/components/rounds/round-central";
import { RoundModalHeaderAction } from "@/components/rounds/round-modal-header-action";
import { RoundModalNav } from "@/components/rounds/round-modal-nav";
import { carregarRodada, carregarRodadaBasica } from "@/features/rounds/central";

/**
 * A casca do modal da rodada — e ela mora aqui, num layout, de propósito.
 *
 * POR QUE NÃO NO `page.tsx`
 *
 * A rodada tem três views: montagem/acompanhamento, comparação de respostas e
 * decisão de compra. Cada uma é uma URL, e cada uma tem o seu `page.tsx` neste
 * mesmo segmento. Se o `<RouteModal>` estivesse dentro delas, ir da rodada para
 * a comparação desmontaria um diálogo e montaria outro: a animação de abertura
 * tocaria de novo, o foco voltaria para o começo, a rolagem da lista atrás
 * pularia e o modal piscaria — tudo isso para trocar o miolo.
 *
 * No layout ele persiste. Verificado na prática: marcando o elemento do diálogo
 * antes de navegar, a marca continua lá depois — é o mesmo nó do DOM. O que
 * troca é só o `children`, e cada view tem a sua fronteira de espera.
 *
 * O CABEÇALHO É DA RODADA, NÃO DA VIEW
 *
 * Título e resumo aqui em cima falam da rodada e não mudam ao trocar de view —
 * é isso que dá a sensação de continuar no mesmo lugar. Quem diz em que view
 * você está é a faixa de navegação dentro do corpo.
 *
 * `xl` porque duas das três views são matrizes largas: comparação tem uma
 * coluna por fornecedor, e decisão tem um cartão por item com os candidatos.
 */
export default async function LayoutDoModalDaRodada({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;

  return (
    <RouteModal
      size="xl"
      // As três views têm alturas muito diferentes — a rodada tem seções
      // empilhadas, a comparação é uma tabela que às vezes tem uma linha. Sem
      // altura fixa a caixa pula de tamanho a cada troca, e o pulo desfaz a
      // ilusão de continuar no mesmo lugar.
      alturaEstavel
      acao={
        <Suspense fallback={<div className="h-7 w-20" />}>
          <AcaoDoCabecalho id={id} />
        </Suspense>
      }
      titulo={
        <Suspense
          fallback={
            <span className="bg-surface-muted block h-5 w-48 animate-pulse rounded" />
          }
        >
          <Titulo id={id} />
        </Suspense>
      }
      descricao={
        <Suspense
          fallback={
            <span className="bg-surface-muted mt-1 block h-4 w-72 animate-pulse rounded" />
          }
        >
          <Descricao id={id} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="border-border h-11 shrink-0 border-b" />}>
        <Navigation id={id} />
      </Suspense>
      {children}
    </RouteModal>
  );
}

async function AcaoDoCabecalho({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  if (!round || round.status !== "completed") return null;
  return <RoundModalHeaderAction roundId={id} />;
}

async function Navigation({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  if (!round || round.status === "draft") return null;
  return <RoundModalNav roundId={id} />;
}

/** Uma leitura só, para o modal ter nome antes do resto chegar. */
async function Titulo({ id }: { id: string }) {
  const round = await carregarRodadaBasica(id);
  return <>{round?.title ?? "Rodada"}</>;
}

async function Descricao({ id }: { id: string }) {
  const dados = await carregarRodada(id);
  if (!dados) return <>Esta rodada não existe mais.</>;
  return <>{descreverRodada(dados)}</>;
}
