"use client";

import { AlertCircle, Handshake } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NEGOTIATION_CHANNELS } from "@/features/quotations/channels";
import {
  recordNegotiation,
  type NegotiationState,
} from "@/features/quotations/negotiation";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Registrando…" : "Registrar"}
    </Button>
  );
}

/**
 * Registro de preço negociado, aberto sob demanda numa célula da comparação.
 *
 * Fica fechado por padrão: a tabela já é densa, e negociar é a exceção, não a
 * leitura do dia a dia.
 */
export function NegotiationForm({
  responseItemId,
  roundId,
  currentPrice,
  supplierName,
  productName,
}: {
  responseItemId: string;
  roundId: string;
  currentPrice: number;
  supplierName: string;
  productName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<NegotiationState, FormData>(
    recordNegotiation,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fg-subtle hover:text-fg h-6 gap-1 px-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Handshake className="size-3" aria-hidden />
        Negociar
      </Button>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken mt-2 flex flex-col gap-2 rounded-lg border p-2 text-left"
      onSubmit={() => setOpen(true)}
    >
      <input type="hidden" name="responseItemId" value={responseItemId} />
      <input type="hidden" name="roundId" value={roundId} />

      <p className="text-fg-subtle text-xs">
        {productName} · {supplierName}
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`preco-${responseItemId}`}
          className="text-fg-muted text-xs"
        >
          Novo preço (atual: {currentPrice.toFixed(2).replace(".", ",")})
        </label>
        <Input
          id={`preco-${responseItemId}`}
          name="newPrice"
          required
          inputMode="decimal"
          placeholder="0,00"
          className="h-7 text-sm"
        />
      </div>

      <select
        name="channel"
        required
        defaultValue="whatsapp"
        aria-label="Canal da negociação"
        className={selectClass}
      >
        {NEGOTIATION_CHANNELS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <Input
        name="notes"
        maxLength={300}
        placeholder="Observação (opcional)"
        className="h-7 text-sm"
      />

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
