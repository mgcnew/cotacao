/**
 * Os tipos que a busca global encontra.
 *
 * Mora em módulo próprio, e não junto da server action, porque um arquivo
 * `"use server"` só pode exportar funções assíncronas: qualquer constante
 * exportada de lá quebra em tempo de execução, mesmo compilando sem erro. É o
 * mesmo motivo do `channels.ts` das negociações.
 */

export type SearchKind = "supplier" | "product" | "order" | "round";

export type SearchHit = {
  key: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  href: string;
};

/** Como cada tipo se anuncia na lista de sugestões. */
export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  supplier: "Fornecedor",
  product: "Produto",
  order: "Pedido",
  round: "Rodada",
};

export const SEARCH_KINDS: SearchKind[] = [
  "supplier",
  "product",
  "order",
  "round",
];

export function isSearchKind(value: string): value is SearchKind {
  return (SEARCH_KINDS as string[]).includes(value);
}
