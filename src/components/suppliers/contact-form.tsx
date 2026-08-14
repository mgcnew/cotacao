"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSupplierContact,
  type ContactFormState,
} from "@/features/suppliers/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar contato"}
    </Button>
  );
}

export function ContactForm({ supplierId }: { supplierId: string }) {
  const [state, formAction] = useActionState<ContactFormState, FormData>(
    createSupplierContact,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="supplierId" value={supplierId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-fg text-sm font-medium">
            Nome
          </label>
          <Input id="name" name="name" required maxLength={120} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-fg text-sm font-medium">
            Função <span className="text-fg-subtle">(opcional)</span>
          </label>
          <Input
            id="role"
            name="role"
            maxLength={60}
            placeholder="Vendedor, gerente…"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="whatsapp" className="text-fg text-sm font-medium">
            WhatsApp
          </label>
          <Input
            id="whatsapp"
            name="whatsapp"
            inputMode="tel"
            placeholder="11 98888-7777"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-fg text-sm font-medium">
            Telefone
          </label>
          <Input id="phone" name="phone" inputMode="tel" maxLength={20} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-fg text-sm font-medium">
            E-mail
          </label>
          <Input id="email" name="email" type="email" />
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-fg-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isPrimary"
            className="accent-primary size-4"
          />
          Contato principal
        </label>
        <SubmitButton />
      </div>

      <p className="text-fg-subtle text-xs">
        Ao menos um meio de contato é obrigatório. Marcar como principal
        substitui o principal atual.
      </p>
    </form>
  );
}
