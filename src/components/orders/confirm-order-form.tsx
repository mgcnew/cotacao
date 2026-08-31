"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  confirmOrder,
  type ConfirmOrderState,
} from "@/features/orders/public-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Confirmando…" : "Confirmar pedido"}
    </Button>
  );
}

export function ConfirmOrderForm({
  token,
  alreadyConfirmed,
  packagingPresentations,
}: {
  token: string;
  alreadyConfirmed: boolean;
  packagingPresentations: {
    productName: string;
    quantity: number;
    unit: string;
  }[];
}) {
  const [state, formAction] = useActionState<ConfirmOrderState, FormData>(
    confirmOrder,
    { error: null },
  );
  const [presentationsConfirmed, setPresentationsConfirmed] = useState(false);

  if (state.confirmed || alreadyConfirmed) {
    return (
      <div className="border-border bg-success-soft text-success flex flex-col items-center gap-2 rounded-xl border px-6 py-8 text-center">
        <CheckCircle2 className="size-6" aria-hidden />
        <p className="font-medium">Pedido confirmado.</p>
        <p className="text-sm">
          O comprador já foi avisado e aguarda a entrega.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {packagingPresentations.length > 0 ? (
        <label className="border-primary/25 bg-primary-soft text-fg flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            name="packagingPresentationsConfirmed"
            required
            checked={presentationsConfirmed}
            onChange={(event) => setPresentationsConfirmed(event.target.checked)}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
          <span>
            <strong className="block">Confirmo as apresentações das embalagens</strong>
            <span className="text-fg-muted mt-0.5 block text-xs">
              As quantidades por pacote indicadas acima continuam corretas.
            </span>
            <span className="text-fg-subtle mt-1.5 block text-xs">
              {packagingPresentations
                .map(
                  (presentation) =>
                    `${presentation.productName}: ${presentation.quantity.toLocaleString("pt-BR")} ${presentation.unit}/pacote`,
                )
                .join(" · ")}
            </span>
          </span>
        </label>
      ) : null}

      <SubmitButton />
      <p className="text-fg-subtle text-center text-xs">
        Confirmando, você assume os itens, quantidades e preços acima.
      </p>
    </form>
  );
}
