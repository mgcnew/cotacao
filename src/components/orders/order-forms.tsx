"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  postReceipt,
  type OrderActionState,
} from "@/features/orders/actions";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export type ReceiptItem = {
  id: string;
  productName: string;
  requestedQuantity: number;
  pendingQuantity: number;
  agreedPrice: number;
  purchaseUnit: string;
  pricingUnit: string;
};

/**
 * Entrada de mercadoria.
 *
 * Deixa em branco o que não veio nesta remessa — o item some do envio em vez
 * de ir zerado, e o saldo continua pendente para a próxima entrega.
 */
export function ReceiptForm({
  orderId,
  items,
}: {
  orderId: string;
  items: ReceiptItem[];
}) {
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    postReceipt,
    { error: null },
  );

  if (state.savedAt) {
    return (
      <div className="border-border bg-success-soft text-success flex flex-col items-center gap-2 rounded-xl border px-6 py-8 text-center">
        <CheckCircle2 className="size-6" aria-hidden />
        <p className="font-medium">Recebimento registrado.</p>
        <p className="text-sm">
          Recarregue a página para ver o saldo atualizado e eventuais
          divergências de preço.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="receivedAt" className="text-fg text-sm font-medium">
            Data do recebimento
          </label>
          <Input id="receivedAt" name="receivedAt" type="datetime-local" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-fg text-sm font-medium">
            Observação <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input id="notes" name="notes" maxLength={300} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name={`nome_${item.id}`} value={item.productName} />

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-fg font-medium">{item.productName}</p>
              <p className="text-fg-subtle text-xs">
                pendente {QTY.format(item.pendingQuantity)} {item.purchaseUnit}{" "}
                · combinado{" "}
                {item.agreedPrice.toFixed(2).replace(".", ",")}/
                {item.pricingUnit}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`log_${item.id}`}
                  className="text-fg-muted text-xs"
                >
                  Recebido ({item.purchaseUnit})
                </label>
                <Input
                  id={`log_${item.id}`}
                  name={`log_${item.id}`}
                  inputMode="decimal"
                  className="h-8"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`prec_${item.id}`}
                  className="text-fg-muted text-xs"
                >
                  Precificação ({item.pricingUnit})
                </label>
                <Input
                  id={`prec_${item.id}`}
                  name={`prec_${item.id}`}
                  inputMode="decimal"
                  className="h-8"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`preco_${item.id}`}
                  className="text-fg-muted text-xs"
                >
                  Preço da nota
                </label>
                <Input
                  id={`preco_${item.id}`}
                  name={`preco_${item.id}`}
                  inputMode="decimal"
                  defaultValue={item.agreedPrice
                    .toFixed(2)
                    .replace(".", ",")}
                  className="h-8"
                />
              </div>
            </div>

            <Input
              name={`obs_${item.id}`}
              maxLength={200}
              placeholder="Observação do item (opcional)"
              className="h-8"
            />
          </div>
        ))}
      </div>

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          Preço diferente do combinado abre divergência comercial
          automaticamente. Item em branco fica pendente para a próxima entrega.
        </p>
        <Submit label="Registrar recebimento" busy="Registrando…" />
      </div>
    </form>
  );
}
