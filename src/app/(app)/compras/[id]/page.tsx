import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  AcoesDaRodada,
  CorpoDaRodada,
  descreverRodada,
} from "@/components/rounds/round-central";
import { Button } from "@/components/ui/button";
import { carregarRodada } from "@/features/rounds/central";

/**
 * A Central da Rodada em tela cheia.
 *
 * É o destino de um F5, de um link colado no WhatsApp e de quem chega de fora
 * de `/compras`. Vindo da lista, a mesma rodada abre em modal por cima dela —
 * mesma URL, mesmo conteúdo, ver `compras/@modal/(.)[id]/page.tsx`.
 *
 * O que difere aqui é só o embrulho: cabeçalho de página com "Voltar" para a
 * lista, porque quem chegou por endereço direto não tem uma lista atrás de si.
 */
export default async function RodadaPage({
  params,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;
  const dados = await carregarRodada(id);

  if (!dados) notFound();

  return (
    <div className="w-full">
      <PageHeader
        title={dados.round.title}
        description={descreverRodada(dados)}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/compras">Voltar</Link>
            </Button>
            <AcoesDaRodada dados={dados} />
          </>
        }
      />

      <CorpoDaRodada dados={dados} />
    </div>
  );
}
