import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  AcoesDaRodada,
  CorpoDaRodada,
} from "@/components/rounds/round-central";
import {
  RoundModalContent,
  type RoundModalView,
} from "@/components/rounds/round-modal-content";
import { EsqueletoDaAba } from "@/components/rounds/round-view-skeletons";
import { carregarRodada, type EscopoDaRodada } from "@/features/rounds/central";

/**
 * A Central da Rodada em página — as abas Respostas, Distribuição e Produtos.
 *
 * Cabeçalho e abas: `layout.tsx` ao lado. Aqui só o miolo, e ele espera DENTRO
 * de um `<Suspense key={view}>`. É o que faz a troca de aba mostrar um
 * esqueleto na hora: a página em si só lê o `?view=` (instantâneo) e devolve a
 * casca; os dados chegam depois, em fluxo. Antes a página inteira esperava as
 * consultas e a tela ficava congelada até elas terminarem.
 *
 * Cada aba pede só os dados que usa (`EscopoDaRodada`).
 */
const ESCOPO_DA_ABA: Record<RoundModalView, EscopoDaRodada> = {
  responses: "respostas",
  distribution: "distribuicao",
  scope: "escopo",
};

export default async function RodadaPage({
  params,
  searchParams,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;
  const { view } = await searchParams;
  const aba: RoundModalView =
    view === "distribution" || view === "scope" ? view : "responses";

  return (
    <Suspense key={aba} fallback={<EsqueletoDaAba view={aba} />}>
      <ConteudoDaAba id={id} aba={aba} />
    </Suspense>
  );
}

async function ConteudoDaAba({ id, aba }: { id: string; aba: RoundModalView }) {
  const dados = await carregarRodada(id, ESCOPO_DA_ABA[aba]);

  if (!dados) notFound();

  if (dados.emPreparacao) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AcoesDaRodada dados={dados} />
        </div>
        <CorpoDaRodada dados={dados} />
      </>
    );
  }

  return <RoundModalContent dados={dados} view={aba} />;
}
