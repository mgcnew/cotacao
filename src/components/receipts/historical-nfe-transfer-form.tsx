"use client";

import { useActionState, useState } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  transferHistoricalNfeToReceipt,
  type HistoricalNfeTransferState,
} from "@/features/receipts/historical-actions";

const INITIAL_STATE: HistoricalNfeTransferState = { error: null };

export function HistoricalNfeTransferForm({
  importId,
  receipts,
}: {
  importId: string;
  receipts: { id: string; name: string; description: string }[];
}) {
  const action = transferHistoricalNfeToReceipt.bind(null, importId);
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const [receiptId, setReceiptId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <label className="text-fg-muted flex flex-col gap-1.5 text-sm">
        Recebimento que utilizará esta NF-e
        <SearchableSelect
          id={`historical-transfer-${importId}`}
          name="receiptId"
          options={receipts}
          value={receiptId}
          onValueChange={(value) => {
            setReceiptId(value);
            setConfirmed(false);
          }}
          placeholder="Digite o número do pedido…"
          emptyMessage="Nenhum recebimento aberto encontrado."
          required
        />
      </label>

      <label className="text-fg-muted flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="confirmTransfer"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4"
        />
        Confirmo que esta NF-e pertence ao pedido selecionado. Ela deixará de
        contar como histórico independente e será conferida no recebimento.
      </label>

      <ErrorLine error={state.error} />
      <FormSubmitButton
        disabled={!receiptId || !confirmed}
        pendingLabel="Transferindo NF-e…"
        className="h-8 px-3 text-sm"
      >
        Usar neste recebimento
      </FormSubmitButton>
    </form>
  );
}
