import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ComparacaoConteudo } from "@/components/rounds/round-comparison";
import { Button } from "@/components/ui/button";
import { carregarComparacao } from "@/features/rounds/comparacao";

/**
 * A comparação em tela cheia.
 *
 * Destino de F5, link colado e de quem chega de fora de `/compras`. Vindo da
 * lista, a mesma URL abre dentro do modal da rodada — mesmo conteúdo, ver
 * `compras/@modal/(.)[id]/comparacao/page.tsx`.
 */
export default async function ComparacaoPage({
  params,
}: PageProps<"/compras/[id]/comparacao">) {
  const { id } = await params;
  const dados = await carregarComparacao(id);

  if (!dados) notFound();

  return (
    <div className="w-full">
      <PageHeader
        title="Comparação de respostas"
        description={`${dados.round.title} · ${dados.suppliers.length} fornecedores · ${dados.rows.length} itens`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/compras/${id}`}>Voltar à rodada</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/alocacao`}>Decidir compra</Link>
            </Button>
          </>
        }
      />

      <ComparacaoConteudo dados={dados} />
    </div>
  );
}
