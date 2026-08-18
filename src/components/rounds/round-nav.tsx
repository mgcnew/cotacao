import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * A faixa que troca de view dentro do modal da rodada.
 *
 * Ela existe porque, no modal, o cabeçalho é da RODADA — nome e resumo, que não
 * mudam. Quem diz "você está na comparação" é o corpo, e é daqui que se anda
 * para as vizinhas sem fechar nada.
 *
 * São links de verdade, não botões com estado: cada view é uma URL, então o
 * voltar do navegador anda entre elas e um link colado abre a view certa em
 * página inteira.
 */
export function NavegacaoDaRodada({
  roundId,
  atual,
}: {
  roundId: string;
  atual: "comparacao" | "alocacao";
}) {
  const irPara =
    atual === "comparacao"
      ? { href: `/compras/${roundId}/alocacao`, label: "Decidir compra" }
      : { href: `/compras/${roundId}/comparacao`, label: "Comparar respostas" };

  return (
    <div className="border-border mb-6 flex flex-wrap items-center gap-2 border-b pb-4">
      <Button asChild size="sm" variant="ghost" className="gap-1.5">
        <Link href={`/compras/${roundId}`}>
          <ArrowLeft className="size-3.5" aria-hidden /> Rodada
        </Link>
      </Button>
      <span className="text-fg text-sm font-medium">
        {atual === "comparacao" ? "Comparação de respostas" : "Decisão de compra"}
      </span>
      <Button asChild size="sm" variant="outline" className="ml-auto">
        <Link href={irPara.href}>{irPara.label}</Link>
      </Button>
    </div>
  );
}
