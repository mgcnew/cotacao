import { notFound } from "next/navigation";

import { AlocacaoConteudo } from "@/components/rounds/round-allocation";
import { NavegacaoDaRodada } from "@/components/rounds/round-nav";
import { carregarAlocacao } from "@/features/rounds/alocacao";

/**
 * A aba Decisão, na decisão de compra. Cabeçalho e abas: `layout.tsx`.
 *
 * O botão de relatório que `AlocacaoConteudo` mostra por padrão continua
 * valendo aqui: é o caminho para o relatório depois de decidir.
 */
export default async function AlocacaoPage({
  params,
}: PageProps<"/compras/[id]/alocacao">) {
  const { id } = await params;
  const dados = await carregarAlocacao(id);

  if (!dados) notFound();

  return (
    <>
      <NavegacaoDaRodada roundId={id} atual="alocacao" />
      <AlocacaoConteudo dados={dados} />
    </>
  );
}
