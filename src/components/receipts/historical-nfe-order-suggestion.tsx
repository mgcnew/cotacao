"use client";

import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  receiveOrderWithHistoricalNfe,
  type HistoricalNfeTransferState,
} from "@/features/receipts/historical-actions";
import type {
  ComparisonRow,
  OrderSuggestion,
} from "@/features/receipts/historical-order-match";
import { cn } from "@/lib/utils";

const INITIAL_STATE: HistoricalNfeTransferState = { error: null };

const DIA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});
const DIA_DA_LOJA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const PCT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/** Dia ISO vira dd/mm sem passar por fuso — é dia, não instante. */
function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DIA.format(new Date(ano, mes - 1, dia));
}

/** Mesma tolerância do critério de sugestão, só para colorir a prévia. */
const TOLERANCIA_PRECO = 0.15;

/**
 * O aviso de que esta nota parece ser de um pedido sem entrada, com a prévia
 * do pedido ao lado do que veio na nota.
 *
 * A prévia vem antes do botão porque quem decide é a pessoa: o sistema sabe
 * que fornecedor, data, produtos e preços batem, mas não sabe se aquela
 * entrega veio. Vendo o pedido inteiro, fica claro o que a nota cobre e o que
 * ficou para outra nota — que, quando o sistema a encontrou, aparece listada.
 */
export function HistoricalNfeOrderSuggestion({
  importId,
  issuedDay,
  posted,
  suggestions,
}: {
  importId: string;
  /** Emissão da nota (AAAA-MM-DD, no fuso da loja). */
  issuedDay: string;
  /** A nota já foi conciliada no histórico. */
  posted: boolean;
  suggestions: OrderSuggestion[];
}) {
  const [selected, setSelected] = useState(suggestions[0]?.orderId ?? "");
  const chosen =
    suggestions.find((suggestion) => suggestion.orderId === selected) ??
    suggestions[0];
  const action = receiveOrderWithHistoricalNfe.bind(
    null,
    importId,
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
      aria-labelledby="sugestao-pedido"
      className="border-warning/40 bg-warning/5 mb-6 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <PackageCheck
          className="text-warning mt-0.5 hidden size-5 shrink-0 sm:block"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 id="sugestao-pedido" className="text-fg font-semibold">
            Esta NF-e parece ser do{" "}
            <Link
              href={`/pedidos/${chosen.orderId}`}
              className="underline-offset-4 hover:underline"
            >
              pedido #{chosen.orderNumber}
            </Link>
            , que ainda não teve entrada
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            Confira a prévia abaixo. Dando entrada pelo recebimento, a nota é
            conferida contra o que foi negociado e o pedido deixa de ficar
            pendente.{" "}
            {posted
              ? "Ela sai do histórico fiscal independente para não contar a mesma compra duas vezes."
              : "Não é preciso associar os produtos aqui antes — a conferência faz isso."}
          </p>

          {suggestions.length > 1 ? (
            <fieldset className="mt-3">
              <legend className="text-fg-muted text-xs">
                Mais de um pedido deste fornecedor combina com a nota
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <label
                    key={suggestion.orderId}
                    className={cn(
                      "border-border inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                      suggestion.orderId === chosen.orderId
                        ? "bg-surface text-fg border-warning/50"
                        : "text-fg-muted hover:bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="pedido-sugerido"
                      value={suggestion.orderId}
                      checked={suggestion.orderId === chosen.orderId}
                      onChange={() => setSelected(suggestion.orderId)}
                      className="sr-only"
                    />
                    #{suggestion.orderNumber}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <ul className="text-fg mt-3 space-y-1 text-sm">
            {evidence.citedInInvoice ? (
              <li>✓ O número do pedido está escrito na nota.</li>
            ) : null}
            <li>
              {todosNoPedido ? "✓" : "·"}{" "}
              {todosNoPedido
                ? evidence.invoiceLines === 1
                  ? "O item da nota está no pedido."
                  : `Todos os ${evidence.invoiceLines} itens da nota estão no pedido.`
                : `${evidence.invoiceLinesInOrder} de ${evidence.invoiceLines} itens da nota estão no pedido.`}
            </li>
            {evidence.pricedLines > 0 ? (
              <li>
                {evidence.pricedLinesWithinTolerance === evidence.pricedLines
                  ? "✓"
                  : "·"}{" "}
                {evidence.pricedLinesWithinTolerance} de {evidence.pricedLines}{" "}
                {evidence.pricedLines === 1 ? "preço" : "preços"} a até 15% do
                negociado.
              </li>
            ) : null}
            <li>
              · Nota emitida em {formatarDia(issuedDay)};{" "}
              {chosen.deliveryDueDate
                ? `entrega prevista para ${formatarDia(chosen.deliveryDueDate)}`
                : `pedido feito em ${formatarDia(chosen.createdDay)}, sem prazo`}
              .
            </li>
          </ul>

          <ComparisonTable rows={chosen.comparison} />

          {evidence.orderLinesCovered < evidence.orderLines ? (
            <div className="text-fg-muted mt-3 text-sm">
              Esta nota traz {evidence.orderLinesCovered} dos{" "}
              {evidence.orderLines} produtos do pedido.{" "}
              {chosen.siblingInvoices.length > 0 ? (
                <>
                  {chosen.siblingInvoices.length === 1
                    ? "Outra nota parece completar a entrega:"
                    : "Outras notas parecem completar a entrega:"}
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {chosen.siblingInvoices.map((sibling) => (
                      <li key={sibling.importId}>
                        <Link
                          href={`/recebimentos/historico/${sibling.importId}`}
                          className="border-border bg-surface hover:text-fg inline-flex rounded-full border px-2.5 py-0.5 text-xs"
                        >
                          NF-e {sibling.invoiceNumber}
                          {sibling.invoiceSeries
                            ? `/${sibling.invoiceSeries}`
                            : ""}{" "}
                          · {DIA_DA_LOJA.format(new Date(sibling.issuedAt))} ·{" "}
                          {MONEY.format(sibling.invoiceTotal)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                "O restante pode ter vindo em outra nota, ou ainda não ter chegado."
              )}
            </div>
          ) : null}

          <form action={formAction} className="mt-4 flex flex-col gap-2">
            <ErrorLine error={state.error} />
            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton
                pendingLabel="Abrindo a conferência…"
                className="h-8 px-3 text-sm"
              >
                Dar entrada no pedido #{chosen.orderNumber}
              </FormSubmitButton>
              <span className="text-fg-subtle text-xs">
                {chosen.openReceiptId
                  ? "A chegada já foi registrada; a nota vai para essa conferência."
                  : "A chegada será registrada na data de emissão da nota."}
              </span>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="border-border bg-surface mt-4 overflow-hidden rounded-lg border">
      <div className="bg-surface-sunken text-fg-muted hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 px-3 py-2 text-xs font-medium sm:grid">
        <span>Produto</span>
        <span>No pedido</span>
        <span>Nesta nota</span>
      </div>
      <ul className="divide-border divide-y">
        {rows.map((row, index) =>
          row.kind === "order" ? (
            <li
              key={`o-${index}`}
              className={cn(
                "grid gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)]",
                !row.invoice && "text-fg-subtle",
              )}
            >
              <span
                className={cn(
                  "wrap-anywhere",
                  row.invoice ? "text-fg font-medium" : "",
                )}
              >
                {row.invoice ? "✓ " : ""}
                {row.productName}
              </span>
              <span className="tabular-nums">
                <span className="text-fg-subtle sm:hidden">Pedido: </span>
                {QTY.format(row.requestedQuantity)} {row.purchaseUnit} ·{" "}
                {MONEY.format(row.agreedPrice)}/{row.pricingUnit}
              </span>
              {row.invoice ? (
                <span className="tabular-nums">
                  <span className="text-fg-subtle sm:hidden">Nota: </span>
                  {QTY.format(row.invoice.quantity)} {row.invoice.unit ?? ""}
                  {row.invoice.practicedPrice !== null ? (
                    <>
                      {" · "}
                      {MONEY.format(row.invoice.practicedPrice)}/
                      {row.pricingUnit}
                      {row.invoice.priceDiff !== null ? (
                        <span
                          className={cn(
                            "ml-1 text-xs",
                            Math.abs(row.invoice.priceDiff) > TOLERANCIA_PRECO
                              ? "text-destructive font-medium"
                              : Math.abs(row.invoice.priceDiff) >= 0.005
                                ? "text-warning"
                                : "text-fg-subtle",
                          )}
                        >
                          {Math.abs(row.invoice.priceDiff) < 0.005
                            ? "igual"
                            : PCT.format(row.invoice.priceDiff)}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="text-xs italic sm:text-sm">
                  não veio nesta nota
                </span>
              )}
            </li>
          ) : (
            <li
              key={`x-${index}`}
              className="bg-warning/5 grid gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)]"
            >
              <span className="text-fg wrap-anywhere">{row.description}</span>
              <span className="text-warning text-xs font-medium sm:text-sm">
                fora do pedido
              </span>
              <span className="tabular-nums">
                <span className="text-fg-subtle sm:hidden">Nota: </span>
                {QTY.format(row.quantity)} {row.unit ?? ""}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
