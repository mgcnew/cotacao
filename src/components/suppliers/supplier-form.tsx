"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSupplier,
  type SupplierFormState,
} from "@/features/suppliers/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Cadastrar fornecedor"}
    </Button>
  );
}

export function SupplierForm() {
  const [state, formAction] = useActionState<SupplierFormState, FormData>(
    createSupplier,
    { error: null },
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-fg text-sm font-medium">
            Nome
          </label>
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={120}
            placeholder="Como sua equipe chama o fornecedor"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="legalName" className="text-fg text-sm font-medium">
              Razão social <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input id="legalName" name="legalName" maxLength={160} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="documentNumber"
              className="text-fg text-sm font-medium"
            >
              CNPJ <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input
              id="documentNumber"
              name="documentNumber"
              inputMode="numeric"
              maxLength={18}
              placeholder="00.000.000/0000-00"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="purchaseLimit"
              className="text-fg text-sm font-medium"
            >
              Limite de compras{" "}
              <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input
              id="purchaseLimit"
              name="purchaseLimit"
              inputMode="decimal"
              placeholder="12.500,00"
            />
            <p className="text-fg-subtle text-xs">
              Teto que você combinou com esse fornecedor.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="notes" className="text-fg text-sm font-medium">
              Observações <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input id="notes" name="notes" maxLength={500} />
          </div>
        </div>
      </section>

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
          No passo seguinte você cadastra os contatos — sem contato, o
          fornecedor não recebe cotação.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
