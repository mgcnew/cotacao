"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmReceiptPrices,
  type ReceiptActionState,
} from "@/features/receipts/actions";
import type { PendingPriceReceipt } from "@/features/receipts/pending-prices";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Decimal no formato que o campo aceita: vírgula, sem separador de milhar. */
function asInput(value: number, digits = 4) {
  return value
    .toFixed(digits)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

function toNumber(raw: string) {
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Confirma os preços de um recebimento fechado sem nota.
 *
 * Duas formas de preencher: digitar do papel, ou escolher uma NF-e do mesmo
 * fornecedor que já foi importada — aí os preços dos produtos em comum vêm
 * prontos e podem ser corrigidos. O que ficar em branco continua pendente.
 */
export function ConfirmPricesForm({
  receipt,
  canConfirm,
}: {
  receipt: PendingPriceReceipt;
  canConfirm: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ReceiptActionState,
    FormData
  >(confirmReceiptPrices, { error: null });
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [pricingQty, setPricingQty] = React.useState<Record<string, string>>(
    {},
  );
  const [noteId, setNoteId] = React.useState("");

  function aplicarNota(importId: string) {
    setNoteId(importId);
    const invoice = receipt.invoices.find(
      (entry) => entry.importId === importId,
    );
    if (!invoice) return;
    const nextPrices: Record<string, string> = {};
    const nextQty: Record<string, string> = {};
    for (const item of receipt.items) {
      const match = invoice.prices.find((p) => p.productId === item.productId);
      if (!match) continue;
      nextPrices[item.receiptItemId] = asInput(match.price);
      if (!item.sameUnit && match.pricingQuantity !== null) {
        nextQty[item.receiptItemId] = asInput(match.pricingQuantity);
      }
    }
    setPrices((current) => ({ ...current, ...nextPrices }));
    setPricingQty((current) => ({ ...current, ...nextQty }));
  }

  const total = receipt.items.reduce((sum, item) => {
    const price = prices[item.receiptItemId];
    const qty = pricingQty[item.receiptItemId];
    return (
      sum +
      (price
        ? toNumber(price) * (qty ? toNumber(qty) : item.pricingQuantity)
        : 0)
    );
  }, 0);
  const filled = receipt.items.filter(
    (item) => (prices[item.receiptItemId] ?? "").trim() !== "",
  ).length;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="receiptId" value={receipt.receiptId} />
      <input type="hidden" name="orderId" value={receipt.orderId} />

      {receipt.invoices.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FileText className="text-fg-subtle size-4" aria-hidden />
          <label
            htmlFor={`nota-${receipt.receiptId}`}
            className="text-fg-muted"
          >
            Preencher com uma NF-e já importada:
          </label>
          <select
            id={`nota-${receipt.receiptId}`}
            value={noteId}
            onChange={(event) => aplicarNota(event.target.value)}
            className="border-border bg-surface text-fg h-8 rounded-md border px-2 text-sm"
          >
            <option value="">Escolher…</option>
            {receipt.invoices.map((invoice) => (
              <option key={invoice.importId} value={invoice.importId}>
                {invoice.label} · {DATE.format(new Date(invoice.issuedAt))}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-fg-subtle text-xs">
          Quando a nota chegar em XML, importe em{" "}
          <Link
            href="/recebimentos/historico"
            className="text-primary underline underline-offset-2"
          >
            Histórico fiscal
          </Link>{" "}
          e concilie os produtos: os preços aparecem aqui para preencher.
        </p>
      )}

      <ul className="border-border divide-border divide-y rounded-xl border">
        {receipt.items.map((item) => {
          const price = prices[item.receiptItemId] ?? "";
          const typed = toNumber(price);
          const far =
            price.trim() !== "" &&
            item.negotiatedPrice > 0 &&
            (typed / item.negotiatedPrice > 3 ||
              typed / item.negotiatedPrice < 1 / 3);
          return (
            <li key={item.receiptItemId} className="px-3 py-3">
              <input type="hidden" name="itemId" value={item.receiptItemId} />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-fg text-sm font-medium">
                  {item.productName}
                </p>
                <p className="text-fg-subtle text-xs tabular-nums">
                  {QTY.format(item.logisticQuantity)} {item.purchaseUnit} ·
                  combinado {MONEY.format(item.negotiatedPrice)}/
                  {item.pricingUnit}
                </p>
              </div>
              <div
                className={`mt-2 grid gap-3 ${item.sameUnit ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
              >
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`cp-${item.receiptItemId}`}
                    className="text-fg-muted text-xs"
                  >
                    Preço da nota (por {item.pricingUnit})
                  </label>
                  <Input
                    id={`cp-${item.receiptItemId}`}
                    name={`preco_${item.receiptItemId}`}
                    inputMode="decimal"
                    className="h-8"
                    placeholder={asInput(item.negotiatedPrice, 2)}
                    value={price}
                    onChange={(event) =>
                      setPrices((current) => ({
                        ...current,
                        [item.receiptItemId]: event.target.value,
                      }))
                    }
                  />
                </div>
                {!item.sameUnit ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`cq-${item.receiptItemId}`}
                      className="text-fg-muted text-xs"
                    >
                      Quantidade na nota ({item.pricingUnit})
                    </label>
                    <Input
                      id={`cq-${item.receiptItemId}`}
                      name={`prec_${item.receiptItemId}`}
                      inputMode="decimal"
                      className="h-8"
                      placeholder={asInput(item.pricingQuantity)}
                      value={pricingQty[item.receiptItemId] ?? ""}
                      onChange={(event) =>
                        setPricingQty((current) => ({
                          ...current,
                          [item.receiptItemId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {far ? (
                  <label className="text-warning flex items-center gap-2 self-end text-xs">
                    <input
                      type="checkbox"
                      name={`confere_${item.receiptItemId}`}
                    />
                    Preço muito diferente do combinado. Confere.
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`nf-${receipt.receiptId}`}
            className="text-fg-muted text-xs"
          >
            Número da nota (opcional)
          </label>
          <Input
            id={`nf-${receipt.receiptId}`}
            name="invoiceNumber"
            maxLength={60}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`ns-${receipt.receiptId}`}
            className="text-fg-muted text-xs"
          >
            Série (opcional)
          </label>
          <Input
            id={`ns-${receipt.receiptId}`}
            name="invoiceSeries"
            maxLength={20}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`nt-${receipt.receiptId}`}
            className="text-fg-muted text-xs"
          >
            Total da nota (opcional)
          </label>
          <Input
            id={`nt-${receipt.receiptId}`}
            name="invoiceTotal"
            inputMode="decimal"
            className="h-8"
          />
        </div>
      </div>

      <ErrorLine error={state.error} />
      {state.savedAt ? (
        <SuccessLine message="Preços confirmados. Diferenças do combinado viraram divergência para tratar." />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted text-xs">
          {filled
            ? `${filled} de ${receipt.items.length} preenchidos · ${MONEY.format(total)}`
            : "O que ficar em branco continua pendente."}
        </p>
        {canConfirm ? (
          <Button type="submit" size="sm" disabled={pending || filled === 0}>
            {pending ? "Confirmando…" : "Confirmar preços"}
          </Button>
        ) : (
          <Badge variant="outline">Sem permissão para confirmar</Badge>
        )}
      </div>
    </form>
  );
}
