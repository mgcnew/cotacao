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
 * abrir na mesma leitura. `?visao=vencedores` mostra o consolidado, e
 * `&sugestoes=1` inclui sugestões ainda não salvas.
 */
export default async function AlocacaoPage({
  params,
  searchParams,
}: PageProps<"/compras/[id]/alocacao">) {
  const [{ id }, { visao, ordem, sugestoes }] = await Promise.all([params, searchParams]);
  const dados = await carregarAlocacao(id);

  if (!dados) notFound();

  return (
    <>
      <NavegacaoDaRodada roundId={id} atual={visao === "vencedores" ? "vencedores" : "alocacao"} />
      <AlocacaoConteudo
        dados={dados}
        visao={visao === "vencedores" ? "vencedores" : visao === "item" ? "item" : "fornecedor"}
        incluirSugestoes={sugestoes === "1"}
        ordem={ordem === "margem" ? "margem" : "grupo"}
      />
    </>
  );
}
