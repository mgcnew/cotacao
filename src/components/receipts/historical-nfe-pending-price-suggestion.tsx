"use client";

import { BadgeDollarSign, Check } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { ComparisonTable } from "@/components/receipts/historical-nfe-order-suggestion";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  confirmPricesWithHistoricalNfe,
  type HistoricalNfeTransferState,
} from "@/features/receipts/historical-actions";
import type { PendingPriceSuggestion } from "@/features/receipts/historical-order-match";
import { cn } from "@/lib/utils";

const INITIAL_STATE: HistoricalNfeTransferState = { error: null };

const DIA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

/** Dia ISO vira dd/mm sem passar por fuso — é dia, não instante. */
function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DIA.format(new Date(ano, mes - 1, dia));
}

/**
 * O aviso de que esta nota parece ser de um pedido já baixado sem nota.
 *
 * É a outra ponta de "Preços a confirmar": lá, quem baixou escolhe a nota; aqui,
 * quem importou a nota vê o pedido. A prévia mostra o preço da nota ao lado do
 * negociado antes de confirmar, porque o que passa daqui vira preço praticado.
 */
export function HistoricalNfePendingPriceSuggestion({
  importId,
  issuedDay,
  suggestions,
}: {
  importId: string;
  /** Emissão da nota (AAAA-MM-DD, no fuso da loja). */
  issuedDay: string;
  suggestions: PendingPriceSuggestion[];
}) {
  const [selected, setSelected] = useState(suggestions[0]?.receiptId ?? "");
  const chosen =
    suggestions.find((suggestion) => suggestion.receiptId === selected) ??
    suggestions[0];
  const action = confirmPricesWithHistoricalNfe.bind(
    null,
    importId,
    chosen?.receiptId ?? "",
    chosen?.orderId ?? "",
  );
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  if (!chosen) return null;
  const { evidence } = chosen;
  const todosNoPedido =
    evidence.invoiceLines > 0 &&
    evidence.invoiceLinesInOrder === evidence.invoiceLines;

  return (
    <section
      aria-labelledby="sugestao-preco-pedido"
      className="border-primary-solid/40 bg-primary-soft mb-6 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <BadgeDollarSign
          className="text-primary mt-0.5 hidden size-5 shrink-0 sm:block"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 id="sugestao-preco-pedido" className="text-fg font-semibold">
            Esta NF-e parece ser do{" "}
            <Link
              href={`/pedidos/${chosen.orderId}`}
              className="underline-offset-4 hover:underline"
            >
              pedido #{chosen.orderNumber}
            </Link>
            , que já foi baixado sem nota
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            A mercadoria já deu entrada; falta confirmar os preços. Ao
            confirmar, os preços da nota substituem os negociados nos{" "}
            {chosen.fillableItems} de {chosen.pendingItems}{" "}
            {chosen.pendingItems === 1 ? "item" : "itens"} que ela cobre,
            diferenças viram divergência para tratar, e a nota passa a valer
            pelo recebimento — não pelo histórico fiscal.
          </p>

          {suggestions.length > 1 ? (
            <fieldset className="mt-3">
              <legend className="text-fg-muted text-xs">
                Mais de uma baixa deste fornecedor combina com a nota
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <label
                    key={suggestion.receiptId}
                    className={cn(
                      "border-border relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                      suggestion.receiptId === chosen.receiptId
                        ? "bg-surface text-fg border-primary-solid/50"
                        : "text-fg-muted hover:bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="baixa-sugerida"
                      value={suggestion.receiptId}
                      checked={suggestion.receiptId === chosen.receiptId}
                      onChange={() => setSelected(suggestion.receiptId)}
                      className="sr-only"
                    />
                    #{suggestion.orderNumber}
                    {suggestion.arrivalDay
                      ? ` · ${formatarDia(suggestion.arrivalDay)}`
                      : ""}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <ul className="text-fg mt-3 space-y-1 text-sm">
            {evidence.citedInInvoice ? (
              <li className="flex items-start gap-1.5">
                <Marca ok />O número do pedido está escrito na nota.
              </li>
            ) : null}
            <li className="flex items-start gap-1.5">
              <Marca ok={todosNoPedido} />
              {todosNoPedido
                ? evidence.invoiceLines === 1
                  ? "O item da nota está no pedido."
                  : `Todos os ${evidence.invoiceLines} itens da nota estão no pedido.`
                : `${evidence.invoiceLinesInOrder} de ${evidence.invoiceLines} itens da nota estão no pedido.`}
            </li>
            {evidence.pricedLines > 0 ? (
              <li className="flex items-start gap-1.5">
                <Marca
                  ok={
                    evidence.pricedLinesWithinTolerance === evidence.pricedLines
                  }
                />
                {evidence.pricedLinesWithinTolerance} de {evidence.pricedLines}{" "}
                {evidence.pricedLines === 1 ? "preço" : "preços"} a até 15% do
                negociado.
              </li>
            ) : null}
            <li className="flex items-start gap-1.5">
              <Marca ok={false} />
              Nota emitida em {formatarDia(issuedDay)};{" "}
              {chosen.arrivalDay
                ? `a mercadoria chegou em ${formatarDia(chosen.arrivalDay)}`
                : chosen.deliveryDueDate
                  ? `entrega prevista para ${formatarDia(chosen.deliveryDueDate)}`
                  : `pedido feito em ${formatarDia(chosen.createdDay)}`}
              .
            </li>
          </ul>

          <ComparisonTable rows={chosen.comparison} />

          {chosen.fillableItems === 0 ? (
            <p className="text-warning mt-3 text-sm">
              Os produtos da nota ainda não estão associados aos do pedido.
              Concilie os itens abaixo e volte aqui para confirmar.
            </p>
          ) : null}

          <form action={formAction} className="mt-4 flex flex-col gap-2">
            <ErrorLine error={state.error} />
            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton
                pendingLabel="Confirmando…"
                className="h-8 px-3 text-sm"
                disabled={chosen.fillableItems === 0}
              >
                Confirmar preços do pedido #{chosen.orderNumber}
              </FormSubmitButton>
              <span className="text-fg-subtle text-xs">
                Só o preço muda; as quantidades da baixa ficam como foram
                conferidas.
              </span>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

/** Marca de evidência: confirmada (✓ desenhado) ou só informada (ponto). */
function Marca({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
    >
      {ok ? (
        <Check className="text-success size-3.5" />
      ) : (
        <span className="bg-fg-subtle size-1 rounded-full" />
      )}
    </span>
  );
}
