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
            defaultValue={state.valores?.name ?? ""}
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
            <Input
              id="legalName"
              name="legalName"
              defaultValue={state.valores?.legalName ?? ""}
              maxLength={160}
            />
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
              defaultValue={state.valores?.documentNumber ?? ""}
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
              defaultValue={state.valores?.purchaseLimit ?? ""}
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
            <Input
              id="notes"
              name="notes"
              defaultValue={state.valores?.notes ?? ""}
              maxLength={500}
            />
          </div>
        </div>
      </section>

      {/* O contato mora no mesmo formulário, e não num segundo passo, porque
          fornecedor sem contato ativo não aparece em "convidar fornecedor" na
          rodada — some da lista sem avisar. Separar os dois momentos convidava
          exatamente a esse estado. Continua opcional: comprar no balcão é
          legítimo, e quem seguir sem contato lê ali embaixo o que isso custa. */}
      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <div>
          <h2 className="text-fg text-sm font-semibold">
            Contato principal{" "}
            <span className="text-fg-subtle font-normal">(opcional)</span>
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            É por ele que a cotação chega. Sem nenhum contato cadastrado, este
            fornecedor não poderá ser convidado para uma rodada.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="contactName"
              className="text-fg text-sm font-medium"
            >
              Nome
            </label>
            <Input
              id="contactName"
              name="contactName"
              defaultValue={state.valores?.contactName ?? ""}
              maxLength={120}
              placeholder="Quem atende você"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="contactRole"
              className="text-fg text-sm font-medium"
            >
              Função <span className="text-fg-subtle">(opcional)</span>
            </label>
            <Input
              id="contactRole"
              name="contactRole"
              defaultValue={state.valores?.contactRole ?? ""}
              maxLength={80}
              placeholder="Vendedor, gerente…"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="contactWhatsapp"
              className="text-fg text-sm font-medium"
            >
              WhatsApp
            </label>
            <Input
              id="contactWhatsapp"
              name="contactWhatsapp"
              defaultValue={state.valores?.contactWhatsapp ?? ""}
              inputMode="tel"
              maxLength={20}
              placeholder="11 98765-4321"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="contactPhone"
              className="text-fg text-sm font-medium"
            >
              Telefone
            </label>
            <Input
              id="contactPhone"
              name="contactPhone"
              defaultValue={state.valores?.contactPhone ?? ""}
              inputMode="tel"
              maxLength={20}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="contactEmail"
              className="text-fg text-sm font-medium"
            >
              E-mail
            </label>
            <Input
              id="contactEmail"
              name="contactEmail"
              defaultValue={state.valores?.contactEmail ?? ""}
              type="email"
              maxLength={160}
            />
          </div>
        </div>

        <p className="text-fg-subtle text-xs">
          Um canal basta. O WhatsApp é o que o envio automático usa.
        </p>
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
          Fornecedor e contato são gravados juntos: ou os dois, ou nenhum.
          Categorias atendidas e agenda de compras ficam na ficha, depois.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
