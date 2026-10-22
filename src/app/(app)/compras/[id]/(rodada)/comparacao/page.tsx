import { notFound } from "next/navigation";

import { ComparacaoConteudo } from "@/components/rounds/round-comparison";
import { carregarComparacao } from "@/features/rounds/comparacao";

/** A aba Decisão, na comparação de respostas. Cabeçalho e abas: `layout.tsx`. */
export default async function ComparacaoPage({
  params,
}: PageProps<"/compras/[id]/comparacao">) {
  const { id } = await params;
  const dados = await carregarComparacao(id);

  if (!dados) notFound();

  return <ComparacaoConteudo dados={dados} />;
}
