import { notFound } from "next/navigation";

import { ComparacaoConteudo } from "@/components/rounds/round-comparison";
import { NavegacaoDaRodada } from "@/components/rounds/round-nav";
import { carregarComparacao } from "@/features/rounds/comparacao";

/**
 * A aba Decisão, na comparação de respostas. Cabeçalho e abas: `layout.tsx`.
 *
 * A faixa "Comparar respostas | Decidir compra" é daqui, e não do layout: é a
 * troca entre as duas ferramentas da aba, e só existe nelas.
 */
export default async function ComparacaoPage({
  params,
}: PageProps<"/compras/[id]/comparacao">) {
  const { id } = await params;
  const dados = await carregarComparacao(id);

  if (!dados) notFound();

  return (
    <>
      <NavegacaoDaRodada roundId={id} atual="comparacao" />
      <ComparacaoConteudo dados={dados} />
    </>
  );
}
