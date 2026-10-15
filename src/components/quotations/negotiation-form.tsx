"use client";

import { AlertCircle, Handshake } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { cn } from "@/lib/utils";
import { NEGOTIATION_CHANNELS } from "@/features/quotations/channels";
import {
  recordNegotiation,
  type NegotiationState,
} from "@/features/quotations/negotiation";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11">
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
  emphasis = false,
}: {
  responseItemId: string;
  roundId: string;
  currentPrice: number;
  supplierName: string;
  productName: string;
  /** Item acima da melhor referência: é onde negociar rende, então a ação sobe de peso. */
  emphasis?: boolean;
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
        variant={emphasis ? "outline" : "ghost"}
        aria-label={`Negociar ${productName} com ${supplierName}`}
        className={cn(
          "h-11 gap-1.5 px-2.5 text-[13px] sm:h-9",
          emphasis ? "text-fg" : "text-fg-muted hover:text-fg",
        )}
        onClick={() => setOpen(true)}
      >
        <Handshake className="size-4" aria-hidden />
        Negociar
      </Button>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken mt-2 flex flex-col gap-3 rounded-lg border p-3 text-left"
      onSubmit={() => setOpen(true)}
    >
      <input type="hidden" name="responseItemId" value={responseItemId} />
      <input type="hidden" name="roundId" value={roundId} />

      <p className="text-fg-muted text-[13px]">
        {productName} · {supplierName}
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`preco-${responseItemId}`}
          className="text-fg text-sm font-medium"
        >
          Novo preço (atual: {currentPrice.toFixed(2).replace(".", ",")})
        </label>
        <Input
          id={`preco-${responseItemId}`}
          name="newPrice"
          required
          inputMode="decimal"
          placeholder="0,00"
          className="h-11 text-base"
        />
      </div>

      <ThemedSelect
        id={`negotiation-channel-${responseItemId}`}
        name="channel"
        required
        defaultValue="whatsapp"
        ariaLabel="Canal da negociação"
        options={NEGOTIATION_CHANNELS.map((channel) => ({
          value: channel.value,
          label: channel.label,
        }))}
      />

      <Input
        name="notes"
        maxLength={300}
        placeholder="Observação (opcional)"
        aria-label="Observação (opcional)"
        className="h-11 text-base"
      />

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-sm font-medium"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton />
        <Button
          type="button"
          variant="ghost"
          className="text-fg-muted h-11"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
