"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { uploadProductImportAction } from "@/features/products/import-actions";

export function ProductImportUploadForm() {
  const [state, action, pending] = useActionState(uploadProductImportAction, {
    error: null,
  });
  return (
    <form
      action={action}
      className="border-border bg-surface grid gap-4 rounded-xl border p-4 shadow-xs sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="grid gap-1.5">
        <label
          htmlFor="product-import-file"
          className="text-fg text-sm font-medium"
        >
          Planilha de produtos
        </label>
        <input
          id="product-import-file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="border-input bg-background file:bg-muted file:text-fg h-10 rounded-lg border px-2 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1"
        />
        <p className="text-fg-muted text-xs">
          Aceita XLSX ou CSV, até 4 MB e 5.000 linhas. A primeira aba será lida.
        </p>
        {state.error ? (
          <p className="text-danger text-sm" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Lendo planilha..." : "Criar rascunho"}
      </Button>
    </form>
  );
}
