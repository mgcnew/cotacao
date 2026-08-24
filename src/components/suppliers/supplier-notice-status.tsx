"use client";

import { Check, RotateCcw } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  reopenSupplierNotice,
  resolveSupplierNotice,
  type SupplierNoticeStatusState,
} from "@/features/suppliers/actions";

export function SupplierNoticeStatusActions({
  noticeId,
  supplierId,
  status,
}: {
  noticeId: string;
  supplierId: string;
  status: string;
}) {
  const action =
    status === "open"
      ? resolveSupplierNotice.bind(null, noticeId, supplierId)
      : reopenSupplierNotice.bind(null, noticeId, supplierId);
  const [state, formAction] = useActionState<SupplierNoticeStatusState, FormData>(
    action,
    { error: null },
  );

  if (status !== "open") {
    return (
      <form action={formAction} className="flex flex-col items-start gap-2">
        <StatusSubmit status={status} />
        <ErrorLine error={state.error} />
      </form>
    );
  }

  return (
    <details className="group/resolve w-full sm:w-auto">
      <summary className="border-border text-fg-muted hover:bg-surface-muted inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors">
        <Check className="size-3.5" aria-hidden /> Resolver
      </summary>
      <form
        action={formAction}
        className="border-border bg-surface-sunken mt-2 flex min-w-64 flex-col gap-2 rounded-lg border p-3"
      >
        <label htmlFor={`resolution-${noticeId}`} className="text-fg text-xs font-medium">
          Como foi resolvido? <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input
          id={`resolution-${noticeId}`}
          name="resolutionNote"
          maxLength={500}
          placeholder="Ex.: utilizado no pedido 154"
          className="h-8"
        />
        <StatusSubmit status={status} />
        <ErrorLine error={state.error} />
      </form>
    </details>
  );
}

function StatusSubmit({ status }: { status: string }) {
  const { pending } = useFormStatus();
  const resolving = status === "open";
  return (
    <Button
      type="submit"
      size="sm"
      variant={resolving ? "outline" : "ghost"}
      disabled={pending}
      className="gap-1.5"
    >
      {resolving ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <RotateCcw className="size-3.5" aria-hidden />
      )}
      {pending ? "Salvando…" : resolving ? "Confirmar resolução" : "Reabrir"}
    </Button>
  );
}
