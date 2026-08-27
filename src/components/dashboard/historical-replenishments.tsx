import { ArrowRight, PackageSearch, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { PurchaseSuggestion } from "@/features/shopping-list/suggestions";

const NUMBER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function quantity(value: number, unit: string) {
  return `${NUMBER.format(value)} ${unit}`;
}

export function HistoricalReplenishments({
  suggestions,
}: {
  suggestions: PurchaseSuggestion[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <section
      className="border-border bg-surface mb-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="historical-replenishments-title"
    >
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="historical-replenishments-title"
            className="text-fg flex items-center gap-2 text-base font-semibold"
          >
            <Sparkles className="text-primary size-4" aria-hidden />
            Reposição para revisar
          </h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            Produtos recorrentes que ainda não estão cobertos nesta semana.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/lista-compras#sugestoes">
            Revisar {suggestions.length}{" "}
            {suggestions.length === 1 ? "sugestão" : "sugestões"}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </header>

      <ul className="divide-border divide-y">
        {suggestions.slice(0, 5).map((suggestion) => {
          const covered =
            suggestion.currentWeekReceivedQuantity +
            suggestion.openOrderQuantity +
            suggestion.openQuotationQuantity +
            suggestion.shoppingListQuantity;
          return (
            <li
              key={suggestion.productId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
            >
              <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                <PackageSearch className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-fg truncate text-sm font-medium">
                    {suggestion.productName}
                  </h3>
                  <span
                    className={
                      suggestion.confidence === "high"
                        ? "bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        : "bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    }
                  >
                    {suggestion.confidence === "high"
                      ? "alta confiança"
                      : "revisar padrão"}
                  </span>
                </div>
                <p className="text-fg-muted mt-0.5 text-xs">
                  Ritmo de{" "}
                  {quantity(
                    suggestion.expectedWeeklyQuantity,
                    suggestion.purchaseUnit,
                  )}{" "}
                  por semana
                  {covered > 0
                    ? ` · ${quantity(covered, suggestion.purchaseUnit)} já coberto`
                    : " · nada coberto"}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-fg-subtle text-[11px]">Falta estimada</p>
                <strong className="text-primary text-sm tabular-nums">
                  {quantity(
                    suggestion.suggestedQuantity,
                    suggestion.purchaseUnit,
                  )}
                </strong>
              </div>
            </li>
          );
        })}
      </ul>

      {suggestions.length > 5 ? (
        <div className="border-border bg-surface-muted/40 border-t px-4 py-2.5 text-center sm:px-5">
          <Link
            href="/lista-compras#sugestoes"
            className="text-primary text-xs font-medium hover:underline"
          >
            Ver mais {suggestions.length - 5} na lista de compras
          </Link>
        </div>
      ) : null}
    </section>
  );
}
