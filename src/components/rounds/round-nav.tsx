import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Alterna as ferramentas da área de decisão.
 *
 * Ela existe porque o cabeçalho da rodada é da RODADA — nome e resumo, que não
 * mudam. Quem diz "você está na comparação" é o corpo, e é daqui que se anda
 * entre as ferramentas da aba Decisão: comparar as respostas (e negociar)
 * e decidir a compra (resumo, melhores preços por fornecedor e geração dos
 * pedidos).
 *
 * São links de verdade, não botões com estado: cada view é uma URL, então o
 * voltar do navegador anda entre elas e um link colado abre a view certa.
 */
export function NavegacaoDaRodada({
  roundId,
  atual,
}: {
  roundId: string;
  atual: "comparacao" | "alocacao" | "vencedores";
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-fg-muted mr-1 text-sm">Ferramenta:</span>
      <Button asChild size="sm" variant={atual === "comparacao" ? "pressed" : "outline"}>
        <Link href={`/compras/${roundId}/comparacao`} aria-current={atual === "comparacao" ? "page" : undefined}>
          Comparar respostas
        </Link>
      </Button>
      <Button asChild size="sm" variant={atual === "alocacao" ? "pressed" : "outline"}>
        <Link href={`/compras/${roundId}/alocacao`} aria-current={atual === "alocacao" ? "page" : undefined}>
          Decidir compra
        </Link>
      </Button>
      <Button asChild size="sm" variant={atual === "vencedores" ? "pressed" : "outline"}>
        <Link href={`/compras/${roundId}/alocacao?visao=vencedores`} aria-current={atual === "vencedores" ? "page" : undefined}>
          Vencedores
        </Link>
      </Button>
    </div>
  );
}
