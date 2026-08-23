import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Alterna as duas ferramentas da área de decisão.
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
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-fg-muted mr-1 text-sm">Ferramenta:</span>
      <Button asChild size="sm" variant={atual === "comparacao" ? "default" : "outline"}>
        <Link href={`/compras/${roundId}/comparacao`} replace>
          Comparar respostas
        </Link>
      </Button>
      <Button asChild size="sm" variant={atual === "alocacao" ? "default" : "outline"}>
        <Link href={`/compras/${roundId}/alocacao`} replace>
          Decidir compra
        </Link>
      </Button>
    </div>
  );
}
