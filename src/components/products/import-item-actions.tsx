"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import {
  toggleProductImportItemAction,
  updateProductImportItemAction,
  type ProductImportItemActionState,
} from "@/features/products/import-actions";

const INITIAL_STATE: ProductImportItemActionState = {
  error: null,
  message: null,
};

function ActionButton({
  label,
  busyLabel,
  variant,
}: {
  label: string;
  busyLabel: string;
  variant: "outline" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : null}
      {pending ? busyLabel : label}
    </Button>
  );
}

export function ProductImportItemActions({
  formId,
  batchId,
  itemId,
  canSave,
  canToggle,
  ignored,
}: {
  formId: string;
  batchId: string;
  itemId: string;
  canSave: boolean;
  canToggle: boolean;
  ignored: boolean;
}) {
  const [saveState, saveAction] = useActionState<
    ProductImportItemActionState,
    FormData
  >(updateProductImportItemAction, INITIAL_STATE);
  const [toggleState, toggleAction] = useActionState<
    ProductImportItemActionState,
    FormData
  >(toggleProductImportItemAction, INITIAL_STATE);
  const feedback =
    (saveState.savedAt ?? 0) >= (toggleState.savedAt ?? 0)
      ? saveState
      : toggleState;

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {canSave ? (
        <form id={formId} action={saveAction}>
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="itemId" value={itemId} />
          <ActionButton
            label="Salvar"
            busyLabel="Salvando…"
            variant="outline"
          />
        </form>
      ) : null}
      {canToggle ? (
        <form action={toggleAction}>
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="ignore" value={ignored ? "false" : "true"} />
          <ActionButton
            label={ignored ? "Restaurar" : "Ignorar"}
            busyLabel={ignored ? "Restaurando…" : "Ignorando…"}
            variant="ghost"
          />
        </form>
      ) : null}
      {feedback.error || feedback.message ? (
        <div className="basis-full pt-1">
          <ErrorLine error={feedback.error} />
          <SuccessLine message={feedback.message} />
        </div>
      ) : null}
    </div>
  );
}
