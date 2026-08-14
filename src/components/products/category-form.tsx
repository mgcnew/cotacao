"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategory, type CategoryFormState } from "@/features/products/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar categoria"}
    </Button>
  );
}

export function CategoryForm() {
  const [state, formAction] = useActionState<CategoryFormState, FormData>(
    createCategory,
    { error: null },
  );

  return (
    <form
      // Remontar após cada gravação limpa os campos sem precisar de efeito.
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="name" className="text-fg text-sm font-medium">
          Nome
        </label>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="Aves, Bovinos, Embalagens…"
        />
      </div>

      <div className="flex flex-[2] flex-col gap-1.5">
        <label htmlFor="description" className="text-fg text-sm font-medium">
          Descrição <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input id="description" name="description" maxLength={240} />
      </div>

      <SubmitButton />

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm sm:order-last sm:w-full"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
