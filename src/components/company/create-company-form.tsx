"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCompany, type CreateCompanyState } from "@/features/company/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando empresa…" : "Criar empresa e começar"}
    </Button>
  );
}

export function CreateCompanyForm() {
  const [state, formAction] = useActionState<CreateCompanyState, FormData>(
    createCompany,
    { error: null },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-fg text-sm font-medium">
          Nome da empresa
        </label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          maxLength={120}
          placeholder="Como sua equipe chama a empresa"
        />
        <p className="text-fg-subtle text-xs">
          É o nome que aparece no menu e nos links enviados aos fornecedores.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="legalName" className="text-fg text-sm font-medium">
          Razão social <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input id="legalName" name="legalName" maxLength={160} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="documentNumber" className="text-fg text-sm font-medium">
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

      <p className="text-fg-subtle text-xs">
        Você entra como Administrador. A empresa já nasce com os papéis
        Comprador, Gerente, Recebimento e Consulta, e com as unidades de medida
        mais comuns — tudo editável depois.
      </p>
    </form>
  );
}
