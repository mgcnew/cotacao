"use client";

import { FileUp } from "lucide-react";
import { useActionState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  uploadHistoricalNfe,
  type HistoricalNfeActionState,
} from "@/features/receipts/historical-actions";

const INITIAL_STATE: HistoricalNfeActionState = { error: null };

export function HistoricalNfeUploadForm() {
  const [state, action] = useActionState(uploadHistoricalNfe, INITIAL_STATE);
  return (
    <form
      action={action}
      className="border-border bg-surface rounded-xl border p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <FileUp className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-fg font-semibold">Adicionar NF-e antiga</h2>
          <p className="text-fg-muted mt-1 text-sm">
            A data de emissão será preservada. Nada será criado como pedido
            pendente.
          </p>
        </div>
      </div>
      <label className="text-fg-muted flex flex-col gap-1.5 text-sm">
        Arquivo XML autorizado
        <input
          type="file"
          name="file"
          accept=".xml,application/xml,text/xml"
          required
          className="border-input bg-background text-fg file:bg-primary file:text-primary-fg h-10 rounded-lg border px-2 py-1 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </label>
      <div className="mt-4 space-y-3">
        <ErrorLine error={state.error} />
        <FormSubmitButton pendingLabel="Lendo e preparando…">
          Importar e conciliar
        </FormSubmitButton>
      </div>
    </form>
  );
}
