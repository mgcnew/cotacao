"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
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
}: {
  token: string;
  alreadyConfirmed: boolean;
}) {
  const [state, formAction] = useActionState<ConfirmOrderState, FormData>(
    confirmOrder,
    { error: null },
  );

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

      <SubmitButton />
      <p className="text-fg-subtle text-center text-xs">
        Confirmando, você assume os itens, quantidades e preços acima.
      </p>
    </form>
  );
}
