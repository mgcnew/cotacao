"use client";

import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  acceptHighConfidencePurchaseSuggestions,
  acceptPurchaseSuggestion,
  dismissPurchaseSuggestion,
  type PurchaseSuggestionState,
} from "@/features/shopping-list/actions";
import type { PurchaseSuggestion } from "@/features/shopping-list/suggestions";

const NUMBER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function quantity(value: number, unit: string) {
  return `${NUMBER.format(value)} ${unit}`;
}

function SubmitButton({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? "Salvando..." : children}
    </Button>
  );
}

function AcceptHighConfidenceButton({ count }: { count: number }) {
  const [state, action] = useActionState<PurchaseSuggestionState, FormData>(
    acceptHighConfidencePurchaseSuggestions,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton>
        <Check aria-hidden /> Adicionar {count} de alta confiança
      </SubmitButton>
      {state.error ? (
        <span
          className="text-destructive max-w-72 text-right text-xs"
          role="alert"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SuggestionCard({
  suggestion,
  canManage,
}: {
  suggestion: PurchaseSuggestion;
  canManage: boolean;
}) {
  const [acceptState, acceptAction] = useActionState<
    PurchaseSuggestionState,
    FormData
  >(acceptPurchaseSuggestion, { error: null });
  const [dismissState, dismissAction] = useActionState<
    PurchaseSuggestionState,
    FormData
  >(dismissPurchaseSuggestion, { error: null });
  const covered =
    suggestion.currentWeekReceivedQuantity +
    suggestion.openOrderQuantity +
    suggestion.openQuotationQuantity +
    suggestion.shoppingListQuantity;

  return (
    <article className="border-border bg-background rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-fg truncate text-sm font-semibold">
            {suggestion.productName}
          </h3>
          <p className="text-fg-muted mt-1 text-xs">
            Ritmo observado:{" "}
            {quantity(
              suggestion.expectedWeeklyQuantity,
              suggestion.purchaseUnit,
            )}{" "}
            por semana
          </p>
        </div>
        <span
          className={
            suggestion.confidence === "high"
              ? "bg-success-soft text-success shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
              : "bg-warning-soft text-warning shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
          }
        >
          {suggestion.confidence === "high"
            ? "Alta confiança"
            : "Confiança média"}
        </span>
      </div>

      <div className="bg-primary-soft/60 mt-3 rounded-lg px-3 py-2.5">
        <p className="text-fg-muted text-xs">
          Sugestão para completar a semana
        </p>
        <p className="text-primary mt-0.5 text-lg font-bold">
          {quantity(suggestion.suggestedQuantity, suggestion.purchaseUnit)}
        </p>
      </div>

      <details className="group mt-3">
        <summary className="text-fg-muted flex cursor-pointer list-none items-center gap-1 text-xs font-medium">
          <ChevronDown
            className="size-3.5 transition-transform group-open:rotate-180"
            aria-hidden
          />
          Como chegamos a este número
        </summary>
        <div className="text-fg-muted mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
          <p>
            Semanas com compra: {suggestion.activeWeeks} de{" "}
            {suggestion.observedWeeks}
          </p>
          <p>
            Oscilação do histórico: {NUMBER.format(suggestion.variationPercent)}
            %
          </p>
          <p>
            Já recebido nesta semana:{" "}
            {quantity(
              suggestion.currentWeekReceivedQuantity,
              suggestion.purchaseUnit,
            )}
          </p>
          <p>
            Em pedidos abertos:{" "}
            {quantity(suggestion.openOrderQuantity, suggestion.purchaseUnit)}
          </p>
          <p>
            Em cotações abertas:{" "}
            {quantity(
              suggestion.openQuotationQuantity,
              suggestion.purchaseUnit,
            )}
          </p>
          <p>
            Já na lista:{" "}
            {quantity(suggestion.shoppingListQuantity, suggestion.purchaseUnit)}
          </p>
          <p className="font-medium sm:col-span-2">
            Total já coberto: {quantity(covered, suggestion.purchaseUnit)}
          </p>
        </div>
      </details>

      {canManage ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <form action={acceptAction} className="flex flex-1 items-end gap-2">
            <input
              type="hidden"
              name="productId"
              value={suggestion.productId}
            />
            <input
              type="hidden"
              name="suggestedQuantity"
              value={suggestion.suggestedQuantity}
            />
            <label className="text-fg-muted flex min-w-0 flex-1 flex-col gap-1 text-xs">
              Quantidade a adicionar ({suggestion.purchaseUnit})
              <Input
                name="quantity"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                defaultValue={suggestion.suggestedQuantity}
                required
                className="h-8"
              />
            </label>
            <SubmitButton>
              <Check aria-hidden /> Adicionar
            </SubmitButton>
          </form>
          <form action={dismissAction}>
            <input
              type="hidden"
              name="productId"
              value={suggestion.productId}
            />
            <input
              type="hidden"
              name="suggestedQuantity"
              value={suggestion.suggestedQuantity}
            />
            <SubmitButton variant="ghost">
              <X aria-hidden /> Não nesta semana
            </SubmitButton>
          </form>
        </div>
      ) : null}

      {acceptState.error || dismissState.error ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {acceptState.error || dismissState.error}
        </p>
      ) : null}
    </article>
  );
}

export function PurchaseSuggestions({
  suggestions,
  canManage,
}: {
  suggestions: PurchaseSuggestion[];
  canManage: boolean;
}) {
  if (suggestions.length === 0) return null;
  const highConfidenceCount = suggestions.filter(
    (suggestion) => suggestion.confidence === "high",
  ).length;

  return (
    <section
      id="sugestoes"
      className="border-border bg-surface mt-4 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="purchase-suggestions-title"
    >
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="purchase-suggestions-title"
            className="text-fg flex items-center gap-2 text-base font-semibold"
          >
            <Sparkles className="text-primary size-4" aria-hidden />
            Sugestões pelo histórico
          </h2>
          <p className="text-fg-muted mt-1 max-w-3xl text-xs leading-relaxed">
            Usa as últimas 8 semanas recebidas e desconta o que já chegou, está
            em pedido, cotação ou nesta lista. Nada é comprado automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-primary-soft text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
            {suggestions.length}{" "}
            {suggestions.length === 1 ? "sugestão" : "sugestões"}
          </span>
          {canManage && highConfidenceCount > 1 ? (
            <AcceptHighConfidenceButton count={highConfidenceCount} />
          ) : null}
        </div>
      </header>
      <div className="grid gap-3 p-3 lg:grid-cols-2 lg:p-4">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.productId}
            suggestion={suggestion}
            canManage={canManage}
          />
        ))}
      </div>
    </section>
  );
}
