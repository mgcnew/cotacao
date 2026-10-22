import { notFound } from "next/navigation";

import {
  AcoesDaRodada,
  CorpoDaRodada,
} from "@/components/rounds/round-central";
import {
  RoundModalContent,
  type RoundModalView,
} from "@/components/rounds/round-modal-content";
import { carregarRodada } from "@/features/rounds/central";

/**
 * A Central da Rodada em página — as abas Respostas, Distribuição e Produtos.
 *
 * Cabeçalho e abas moram no `layout.tsx` ao lado. Aqui só o miolo: em
 * preparação, a montagem; depois de iniciada, a view pedida em `?view=`.
 */
export default async function RodadaPage({
  params,
  searchParams,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;
  const { view } = await searchParams;
  const dados = await carregarRodada(id);

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

  const modalView: RoundModalView =
    view === "distribution" || view === "scope" ? view : "responses";

  return <RoundModalContent dados={dados} view={modalView} />;
}
