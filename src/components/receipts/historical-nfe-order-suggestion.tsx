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

export type OrderSuggestionView = {
  orderId: string;
  orderNumber: number;
  deliveryDueDate: string | null;
  createdDay: string;
  openReceiptId: string | null;
  itemCount: number;
  matchedItems: number;
  citedInInvoice: boolean;
  strong: boolean;
};

/**
 * O aviso de que esta nota parece ser de um pedido sem entrada.
 *
 * Mostra a evidência — e não só o veredito — porque quem decide é a pessoa:
 * ela sabe se aquela entrega veio ou não. Os candidatos menos prováveis ficam
 * listados abaixo do principal, para o caso de o sistema ter escolhido o
 * errado.
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
  suggestions: OrderSuggestionView[];
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

  return (
    <section
      aria-labelledby="sugestao-pedido"
      className="border-warning/40 bg-warning/5 mb-6 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <PackageCheck
          className="text-warning mt-0.5 size-5 shrink-0"
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
            Dando entrada pelo recebimento, a nota é conferida contra o que foi
            negociado e o pedido deixa de ficar pendente.{" "}
            {posted
              ? "Ela sai do histórico fiscal independente para não contar a mesma compra duas vezes."
              : "Não é preciso associar os produtos aqui antes — a conferência faz isso."}
          </p>

          <ul className="text-fg mt-3 space-y-1 text-sm">
            {chosen.citedInInvoice ? (
              <li>✓ O número do pedido está escrito na nota.</li>
            ) : null}
            <li>
              {chosen.matchedItems > 0 ? "✓" : "·"} {chosen.matchedItems} de{" "}
              {chosen.itemCount}{" "}
              {chosen.itemCount === 1 ? "produto" : "produtos"} do pedido{" "}
              {chosen.matchedItems === 1 ? "aparece" : "aparecem"} na nota.
            </li>
            <li>
              · Nota emitida em {formatarDia(issuedDay)};{" "}
              {chosen.deliveryDueDate
                ? `entrega prevista para ${formatarDia(chosen.deliveryDueDate)}`
                : `pedido feito em ${formatarDia(chosen.createdDay)}, sem prazo`}
              .
            </li>
            <li>
              ·{" "}
              {chosen.openReceiptId
                ? "A chegada já foi registrada; a nota vai para essa conferência."
                : "A chegada será registrada na data de emissão da nota."}
            </li>
          </ul>

          {suggestions.length > 1 ? (
            <fieldset className="mt-4">
              <legend className="text-fg-muted text-xs">
                Outros pedidos sem entrada deste fornecedor no mesmo período
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
                    <span className="text-fg-subtle text-xs">
                      {suggestion.matchedItems}/{suggestion.itemCount}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
              {!chosen.strong ? (
                <span className="text-fg-subtle text-xs">
                  Poucos produtos em comum — confira se é mesmo esta entrega.
                </span>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
