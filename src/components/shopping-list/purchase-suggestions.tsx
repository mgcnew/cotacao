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
const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CADENCE_LABEL: Record<1 | 2 | 4, string> = {
  1: "Toda semana",
  2: "A cada 2 semanas",
  4: "A cada 4 semanas",
};

function quantity(value: number, unit: string) {
  return `${NUMBER.format(value)} ${unit}`;
}

function historySource(suggestion: PurchaseSuggestion) {
  const parts = [];
  if (suggestion.historicalNfeCount > 0) {
    parts.push(
      `${suggestion.historicalNfeCount} ${suggestion.historicalNfeCount === 1 ? "NF-e histórica" : "NF-e históricas"}`,
    );
  }
  if (suggestion.receiptCount > 0) {
    parts.push(
      `${suggestion.receiptCount} ${suggestion.receiptCount === 1 ? "recebimento" : "recebimentos"}`,
    );
  }
  return parts.join(" e ");
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
            {CADENCE_LABEL[suggestion.cadenceWeeks]}
            {suggestion.preferredSupplierName
              ? ` · mais frequente com ${suggestion.preferredSupplierName}`
              : ""}
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
            ? "Histórico consistente"
            : "Revisar histórico"}
        </span>
      </div>

      {suggestion.suggestedQuantity !== null ? (
        <div className="bg-primary-soft/60 mt-3 rounded-lg px-3 py-2.5">
          <p className="text-fg-muted text-xs">
            Sugestão para este ciclo de compra
          </p>
          <p className="text-primary mt-0.5 text-lg font-bold">
            {quantity(suggestion.suggestedQuantity, suggestion.purchaseUnit)}
          </p>
          {suggestion.demandAdjustmentPercent !== 0 &&
          suggestion.expectedCycleQuantity !== null ? (
            <p className="text-fg-muted mt-1 text-xs">
              Meta ajustada para{" "}
              {quantity(
                suggestion.expectedCycleQuantity,
                suggestion.purchaseUnit,
              )}{" "}
              ({suggestion.demandAdjustmentPercent > 0 ? "+" : ""}
              {NUMBER.format(suggestion.demandAdjustmentPercent)}% pelo
              calendário)
            </p>
          ) : null}
        </div>
      ) : (
        <div className="bg-warning-soft text-warning mt-3 rounded-lg px-3 py-2.5">
          <p className="text-sm font-semibold">Compra recorrente prevista</p>
          <p className="mt-1 text-xs leading-relaxed">
            A frequência é confiável, mas a NF-e não permite converter a
            quantidade com segurança para {suggestion.purchaseUnit}. Informe a
            quantidade antes de adicionar à lista.
          </p>
        </div>
      )}

      {suggestion.demandContexts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestion.demandContexts.map((context) => (
            <span
              key={`${context.name}-${context.adjustmentPercent}`}
              className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[10px] font-semibold"
            >
              {context.name}: {context.adjustmentPercent > 0 ? "+" : ""}
              {NUMBER.format(context.adjustmentPercent)}%
            </span>
          ))}
        </div>
      ) : null}

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
            Semanas com compra: {suggestion.activeWeeks} em{" "}
            {suggestion.observedWeeks}
            {" semanas observadas"}
          </p>
          <p>
            Regularidade da frequência:{" "}
            {NUMBER.format(suggestion.cadenceConfidencePercent)}%
          </p>
          <p>
            Base: {suggestion.historyEventCount} compras (
            {historySource(suggestion)})
          </p>
          <p>
            Próxima ocorrência estimada:{" "}
            {DATE.format(new Date(`${suggestion.nextExpectedDate}T12:00:00`))}
          </p>
          {suggestion.historicalCycleQuantity !== null ? (
            <>
              <p>
                Quantidade típica por ciclo:{" "}
                {quantity(
                  suggestion.historicalCycleQuantity,
                  suggestion.purchaseUnit,
                )}
              </p>
              <p>
                Oscilação das quantidades:{" "}
                {NUMBER.format(suggestion.variationPercent)}%
              </p>
            </>
          ) : (
            <p className="sm:col-span-2">
              Quantidade não estimada: unidade fiscal diferente da unidade de
              compra.
            </p>
          )}
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
              value={suggestion.suggestedQuantity ?? ""}
            />
            <label className="text-fg-muted flex min-w-0 flex-1 flex-col gap-1 text-xs">
              Quantidade a adicionar ({suggestion.purchaseUnit})
              <Input
                name="quantity"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                defaultValue={suggestion.suggestedQuantity ?? undefined}
                placeholder={
                  suggestion.suggestedQuantity === null
                    ? "Informe a quantidade"
                    : undefined
                }
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
              value={suggestion.suggestedQuantity ?? ""}
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
    (suggestion) =>
      suggestion.confidence === "high" && suggestion.suggestedQuantity !== null,
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
            Combina recebimentos e NF-e históricas, identifica ciclos de até um
            mês e desconta o que já está coberto. Nada é comprado
            automaticamente.
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
