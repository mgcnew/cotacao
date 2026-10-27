import { Hourglass } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

type Celula = {
  currentPrice: number | null;
  doesNotSupply: boolean;
  isAvailable: boolean | null;
};

/**
 * Quantos fornecedores já responderam, e se alguém já deu preço.
 *
 * "Respondeu" é ter dado preço, ou dito que não fornece, ou dito que não tem
 * agora: qualquer resposta. "Tem preço" é a pergunta de quem compara — sem ao
 * menos um preço não há o que comparar nem o que decidir.
 */
export function resumoDeRespostas(
  rows: { cells: Map<string, Celula> }[],
  suppliers: { id: string; removed_at: string | null }[],
) {
  const ativos = suppliers.filter((supplier) => supplier.removed_at === null);
  const responderam = ativos.filter((supplier) =>
    rows.some((row) => {
      const cell = row.cells.get(supplier.id);
      return Boolean(
        cell &&
          (cell.currentPrice !== null ||
            cell.doesNotSupply ||
            cell.isAvailable === false),
      );
    }),
  ).length;
  const comPreco = rows.some((row) =>
    ativos.some((supplier) => row.cells.get(supplier.id)?.currentPrice != null),
  );
  return { total: ativos.length, responderam, comPreco };
}

/**
 * O que aparece em Comparar e em Decidir quando ninguém respondeu ainda.
 *
 * Sem isto, as duas telas desenhavam o que viria com dados mesmo sem nenhum:
 * "falta apresentação" em vermelho em cada item, "R$ 0,00" no total e nove
 * selos de "conversão pendente". Parecia que quem comprava tinha esquecido de
 * preencher algo, quando o certo era esperar — ou cobrar. A ação aqui é uma só,
 * e é a certa.
 */
export function AindaSemRespostas({
  roundId,
  responderam,
  total,
  tela,
}: {
  roundId: string;
  responderam: number;
  total: number;
  tela: "comparar" | "decidir";
}) {
  const quem =
    total === 0
      ? "Nenhum fornecedor foi convidado."
      : `${responderam} de ${total} ${total === 1 ? "fornecedor respondeu" : "fornecedores responderam"}.`;

  return (
    <EmptyState
      icon={Hourglass}
      title="Ainda sem respostas"
      description={`${quem} ${tela === "comparar" ? "A comparação" : "A decisão de compra"} aparece quando chegar o primeiro preço.`}
      action={
        <Button asChild size="sm" className="h-11 sm:h-8">
          <Link href={`/compras/${roundId}`}>
            {total === 0 ? "Convidar fornecedores" : "Cobrar respostas"}
          </Link>
        </Button>
      }
    />
  );
}
