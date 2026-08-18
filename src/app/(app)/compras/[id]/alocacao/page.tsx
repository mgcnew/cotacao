import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { AlocacaoConteudo } from "@/components/rounds/round-allocation";
import { Button } from "@/components/ui/button";
import { carregarAlocacao } from "@/features/rounds/alocacao";

/**
 * A decisão de compra em tela cheia.
 *
 * Destino de F5, link colado e de quem chega de fora de `/compras`. Vindo da
 * lista, a mesma URL abre dentro do modal da rodada.
 *
 * O `redirect` por falta de permissão saiu daqui: quem decide o que dizer é o
 * conteúdo, que serve aos dois embrulhos. Dentro do modal, um desvio levaria
 * embora a lista inteira.
 */
export default async function AlocacaoPage({
  params,
}: PageProps<"/compras/[id]/alocacao">) {
  const { id } = await params;
  const dados = await carregarAlocacao(id);

  if (!dados) notFound();

  return (
    <div className="w-full">
      <PageHeader
        title="Decisão de compra"
        description={`${dados.round.title} · escolha de quem comprar cada item, com divisão entre fornecedores quando fizer sentido`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/compras/${id}`}>Voltar à rodada</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/comparacao`}>Comparação</Link>
            </Button>
          </>
        }
      />

      <AlocacaoConteudo dados={dados} />
    </div>
  );
}
