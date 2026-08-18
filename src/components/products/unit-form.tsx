"use client";

import { AlertCircle } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUnit, type UnitFormState } from "@/features/products/actions";
import { UNIT_KINDS } from "@/features/products/units";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar unidade"}
    </Button>
  );
}

export function UnitForm({ aoSalvar }: { aoSalvar?: () => void } = {}) {
  // Envolver a action é como o formulário avisa quem está por fora que gravou —
  // é o que fecha o modal quando ele é aberto de dentro do cadastro de produto.
  // Fora do modal, `aoSalvar` não existe e nada muda.
  const acao = React.useCallback(
    async (anterior: UnitFormState, dados: FormData) => {
      const resultado = await createUnit(anterior, dados);
      if (!resultado.error) aoSalvar?.();
      return resultado;
    },
    [aoSalvar],
  );

  const [state, formAction] = useActionState<UnitFormState, FormData>(acao, {
    error: null,
  });

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_7rem_10rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-fg text-sm font-medium">
            Código
          </label>
          <Input
            id="code"
            name="code"
            required
            maxLength={12}
            placeholder="kg"
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-fg text-sm font-medium">
            Nome
          </label>
          <Input
            id="name"
            name="name"
            required
            maxLength={60}
            placeholder="Quilograma"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="symbol" className="text-fg text-sm font-medium">
            Símbolo
          </label>
          <Input
            id="symbol"
            name="symbol"
            maxLength={12}
            placeholder="kg"
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="kind" className="text-fg text-sm font-medium">
            Tipo
          </label>
          <select
            id="kind"
            name="kind"
            required
            defaultValue="count"
            className="border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            {UNIT_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.hint ? `${kind.label} — ${kind.hint}` : kind.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          Símbolo em branco repete o código. O tipo agrupa a lista e prepara a
          comparação normalizada.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
