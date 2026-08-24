"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  postDraftReceipt,
  type ReceiptActionState,
} from "@/features/receipts/actions";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

type Item = {
  id: string;
  productName: string;
  requestedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  agreedPrice: number;
  purchaseUnit: string;
  pricingUnit: string;
};

function numberFromField(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Finalizando…" : "Finalizar conferência"}
    </Button>
  );
}

export function ReceiptConferenceForm({
  receiptId,
  orderId,
  items,
  invoiceNumber,
  invoiceSeries,
  invoiceTotal,
  notes,
}: {
  receiptId: string;
  orderId: string;
  items: Item[];
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceTotal: number | null;
  notes: string | null;
}) {
  const [state, action] = useActionState<ReceiptActionState, FormData>(
    postDraftReceipt,
    { error: null },
  );
  const [calculatedTotal, setCalculatedTotal] = React.useState(0);
  const [typedInvoiceTotal, setTypedInvoiceTotal] = React.useState(
    invoiceTotal ?? 0,
  );

  function recalculate(form: HTMLFormElement) {
    const data = new FormData(form);
    setCalculatedTotal(
      items.reduce(
        (sum, item) =>
          sum +
          numberFromField(data.get(`prec_${item.id}`)) *
            numberFromField(data.get(`preco_${item.id}`)),
        0,
      ),
    );
    setTypedInvoiceTotal(numberFromField(data.get("invoiceTotal")));
  }

  return (
    <form
      action={action}
      onInput={(event) => recalculate(event.currentTarget)}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="orderId" value={orderId} />

      <section className="border-border bg-surface rounded-xl border p-4">
        <h2 className="text-fg text-sm font-semibold">Nota fiscal</h2>
        <p className="text-fg-muted mt-1 mb-4 text-sm">
          Estes dados identificam a entrega. A soma calculada usa quantidade de
          precificação × preço de cada produto.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invoiceNumber"
              className="text-fg text-sm font-medium"
            >
              Número
            </label>
            <Input
              id="invoiceNumber"
              name="invoiceNumber"
              defaultValue={invoiceNumber ?? ""}
              maxLength={60}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invoiceSeries"
              className="text-fg text-sm font-medium"
            >
              Série
            </label>
            <Input
              id="invoiceSeries"
              name="invoiceSeries"
              defaultValue={invoiceSeries ?? ""}
              maxLength={20}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invoiceTotal"
              className="text-fg text-sm font-medium"
            >
              Total da nota
            </label>
            <Input
              id="invoiceTotal"
              name="invoiceTotal"
              inputMode="decimal"
              defaultValue={invoiceTotal?.toFixed(2).replace(".", ",") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="receiptNotes"
              className="text-fg text-sm font-medium"
            >
              Observação
            </label>
            <Input
              id="receiptNotes"
              name="notes"
              defaultValue={notes ?? ""}
              maxLength={500}
            />
          </div>
        </div>
        <div className="bg-surface-sunken mt-4 grid gap-2 rounded-lg px-3 py-2 text-sm sm:grid-cols-3">
          <span>
            Soma dos itens: <strong>{MONEY.format(calculatedTotal)}</strong>
          </span>
          <span>
            Total da nota: <strong>{MONEY.format(typedInvoiceTotal)}</strong>
          </span>
          <span
            className={
              typedInvoiceTotal &&
              Math.abs(typedInvoiceTotal - calculatedTotal) > 0.009
                ? "text-destructive"
                : "text-success"
            }
          >
            Diferença:{" "}
            <strong>{MONEY.format(typedInvoiceTotal - calculatedTotal)}</strong>
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-fg text-sm font-semibold">Produtos recebidos</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Deixe em branco o que não veio nesta entrega; o saldo continuará
            pendente.
          </p>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className="border-border bg-surface rounded-xl border p-4"
          >
            <input type="hidden" name="itemId" value={item.id} />
            <input
              type="hidden"
              name={`nome_${item.id}`}
              value={item.productName}
            />
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-fg font-medium">{item.productName}</p>
                <p className="text-fg-subtle text-xs">
                  Pedido {QTY.format(item.requestedQuantity)}{" "}
                  {item.purchaseUnit}
                  {item.receivedQuantity > 0
                    ? ` · já recebido ${QTY.format(item.receivedQuantity)}`
                    : ""}
                </p>
              </div>
              <p className="text-fg-muted text-sm">
                Pendente{" "}
                <strong>
                  {QTY.format(item.pendingQuantity)} {item.purchaseUnit}
                </strong>
                {" · "}combinado{" "}
                <strong>
                  {MONEY.format(item.agreedPrice)}/{item.pricingUnit}
                </strong>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
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
                  defaultValue={item.agreedPrice.toFixed(2).replace(".", ",")}
                  className="h-8"
                />
              </div>
            </div>
            <Input
              name={`obs_${item.id}`}
              maxLength={200}
              placeholder="Observação do produto (opcional)"
              className="mt-3 h-8"
            />
          </div>
        ))}
      </section>

      <ErrorLine error={state.error} />
      <div className="border-border bg-surface sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-lg">
        <p className="text-fg-subtle text-xs">
          Finalizar atualiza o saldo e abre divergências de preço ou excesso
          automaticamente.
        </p>
        <Submit />
      </div>
    </form>
  );
}
