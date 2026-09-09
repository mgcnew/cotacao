"use client";

import { CheckCircle2, LoaderCircle, Printer } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  submitNegotiationReference,
  type NegotiationReferenceState,
} from "@/features/quotations/negotiation-reference-actions";
import type { PublicNegotiationReference } from "@/features/quotations/negotiation-reference";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QUANTITY = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : null}
      {pending ? "Enviando…" : "Enviar contraproposta"}
    </Button>
  );
}

export function NegotiationReferenceResponseForm({
  token,
  negotiation,
}: {
  token: string;
  negotiation: PublicNegotiationReference;
}) {
  const [state, action] = useActionState<NegotiationReferenceState, FormData>(
    submitNegotiationReference,
    { error: null },
  );
  const completed = negotiation.status === "completed" || state.submitted;

  if (completed) {
    return (
      <section className="border-success/30 bg-success-soft text-fg flex flex-col items-center gap-2 rounded-2xl border px-5 py-10 text-center">
        <CheckCircle2 className="text-success size-8" aria-hidden />
        <h2 className="font-semibold">Contraproposta enviada</h2>
        <p className="text-fg-muted max-w-md text-sm">
          Os novos valores foram registrados e já estão disponíveis para o
          comprador comparar.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {negotiation.items.map((item) => (
        <article
          key={item.id}
          className="border-border bg-surface rounded-2xl border p-4 shadow-xs sm:p-5"
        >
          <input type="hidden" name="itemId" value={item.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-fg font-semibold">{item.product_name}</h2>
              <p className="text-fg-muted mt-0.5 text-sm">
                {QUANTITY.format(Number(item.requested_quantity))}{" "}
                {item.purchase_unit} solicitados
              </p>
            </div>
            <span className="bg-primary-soft text-primary rounded-full px-2.5 py-1 text-xs font-medium">
              preço por {item.pricing_unit}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
              <p className="text-fg-subtle text-xs">Sua proposta atual</p>
              <p className="text-fg mt-1 font-semibold tabular-nums">
                {MONEY.format(Number(item.supplier_price))}/
                {item.pricing_unit}
              </p>
            </div>
            <div className="border-primary/25 bg-primary-soft/50 rounded-xl border px-3 py-2.5">
              <p className="text-fg-subtle text-xs">
                {item.reference_kind === "best_competitor"
                  ? "Melhor referência recebida"
                  : "Preço-alvo do comprador"}
              </p>
              <p className="text-primary mt-1 font-semibold tabular-nums">
                {MONEY.format(Number(item.reference_price))}/
                {item.reference_unit}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`new-price-${item.id}`}
                className="text-fg text-sm font-medium"
              >
                Sua nova oferta ({item.pricing_unit})
              </label>
              <Input
                id={`new-price-${item.id}`}
                name={`newPrice_${item.id}`}
                required
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </div>
        </article>
      ))}

      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 print:hidden">
        <div>
          <p className="text-fg text-sm font-medium">
            Revise antes de enviar
          </p>
          <p className="text-fg-muted text-xs">
            O envio registra uma nova oferta sem apagar sua proposta anterior.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="flex-1 sm:flex-none"
          >
            <Printer aria-hidden /> Imprimir
          </Button>
          <SubmitButton />
        </div>
      </div>
      <ErrorLine error={state.error} />
    </form>
  );
}
