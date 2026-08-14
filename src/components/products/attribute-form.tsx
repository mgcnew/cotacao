"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAttributeDefinition,
  type AttributeFormState,
} from "@/features/products/actions";
import { ATTRIBUTE_DATA_TYPES } from "@/features/products/attributes";

type Props = {
  categoryId: string;
  units: { id: string; label: string }[];
};

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar atributo"}
    </Button>
  );
}

export function AttributeForm({ categoryId, units }: Props) {
  const [state, formAction] = useActionState<AttributeFormState, FormData>(
    createAttributeDefinition,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="categoryId" value={categoryId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-fg text-sm font-medium">
            Nome
          </label>
          <Input
            id="name"
            name="name"
            required
            maxLength={60}
            placeholder="Quantidade por pacote"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="dataType" className="text-fg text-sm font-medium">
            Tipo
          </label>
          <select
            id="dataType"
            name="dataType"
            required
            defaultValue="numeric"
            className={selectClass}
          >
            {ATTRIBUTE_DATA_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="unitId" className="text-fg text-sm font-medium">
            Unidade <span className="text-fg-subtle">(opcional)</span>
          </label>
          <select id="unitId" name="unitId" className={selectClass}>
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
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

      <div className="flex flex-col gap-2">
        <label className="text-fg-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isRequired"
            className="accent-primary size-4"
          />
          Obrigatório ao cadastrar produto desta categoria
        </label>

        <label className="text-fg-muted flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="isConversionFactor"
            className="accent-primary mt-0.5 size-4"
          />
          <span>
            Usar como fator de conversão
            <span className="text-fg-subtle block text-xs">
              O número que o fornecedor informar divide o preço cotado para
              chegar ao preço na unidade de comparação. Ex.: quantidade por
              pacote transforma R$/pacote em R$/unidade. Só um por categoria, e
              só em atributo numérico.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
