import { notFound } from "next/navigation";

import { AlocacaoConteudo } from "@/components/rounds/round-allocation";
import { NavegacaoDaRodada } from "@/components/rounds/round-nav";
import { carregarAlocacao } from "@/features/rounds/alocacao";

/**
 * A aba Decisão, na decisão de compra. Cabeçalho e abas: `layout.tsx`.
 *
 * O botão de relatório que `AlocacaoConteudo` mostra por padrão continua
 * valendo aqui: é o caminho para o relatório depois de decidir.
 *
 * `?visao=item` troca a leitura por fornecedor pela leitura por item, e
 * `&ordem=margem` põe as vitórias apertadas no topo. Fica na URL para o link
 * abrir na mesma leitura.
 */
export default async function AlocacaoPage({
  params,
  searchParams,
}: PageProps<"/compras/[id]/alocacao">) {
  const [{ id }, { visao, ordem }] = await Promise.all([params, searchParams]);
  const dados = await carregarAlocacao(id);

  if (!dados) notFound();

  return (
    <>
      <NavegacaoDaRodada roundId={id} atual="alocacao" />
      <AlocacaoConteudo
        dados={dados}
        visao={visao === "item" ? "item" : "fornecedor"}
        ordem={ordem === "margem" ? "margem" : "grupo"}
      />
    </>
  );
}
