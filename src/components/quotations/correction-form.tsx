"use client";

import { AlertCircle, PencilLine } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  correctResponseItem,
  type CorrectionState,
} from "@/features/quotations/correction";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Corrigindo…" : "Corrigir"}
    </Button>
  );
}

/**
 * Correção da resposta pelo comprador.
 *
 * O fornecedor não pode reenviar item já respondido — regra do banco. Quando
 * ele erra o preço ou marca "não fornece" sem querer, o conserto é aqui, com
 * motivo obrigatório e registro de quem mudou o quê.
 */
export function CorrectionForm({
  responseItemId,
  roundId,
  currentPrice,
  doesNotSupply,
  supplierName,
  productName,
  pricingUnit,
  conversionDefinitionId = null,
  conversionName = null,
  conversionUnit = null,
  currentConversionFactor = null,
  conversionRequired = false,
}: {
  responseItemId: string;
  roundId: string;
  currentPrice: number | null;
  doesNotSupply: boolean;
  supplierName: string;
  productName: string;
  pricingUnit: string;
  conversionDefinitionId?: string | null;
  conversionName?: string | null;
  conversionUnit?: string | null;
  currentConversionFactor?: number | null;
  conversionRequired?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [fornece, setFornece] = React.useState(!doesNotSupply);
  const [state, formAction] = useActionState<CorrectionState, FormData>(
    correctResponseItem,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fg-subtle hover:text-fg h-6 gap-1 px-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <PencilLine className="size-3" aria-hidden />
        Corrigir
      </Button>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken mt-2 flex flex-col gap-2 rounded-lg border p-2 text-left"
    >
      <input type="hidden" name="responseItemId" value={responseItemId} />
      <input type="hidden" name="roundId" value={roundId} />

      <p className="text-fg-subtle text-xs">
        {productName} · {supplierName}
      </p>

      <ThemedSelect
        id={`corr-fornece-${responseItemId}`}
        name="supplies"
        value={fornece ? "sim" : "nao"}
        onValueChange={(next) => setFornece(next === "sim")}
        ariaLabel="O fornecedor trabalha com este produto?"
        options={[
          { value: "sim", label: "Fornece este produto" },
          { value: "nao", label: "Não trabalha com este produto" },
        ]}
      />

      {fornece ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`corr-preco-${responseItemId}`}
            className="text-fg-muted text-xs"
          >
            Preço por {pricingUnit}
            {currentPrice !== null
              ? ` (atual: ${currentPrice.toFixed(2).replace(".", ",")})`
              : ""}
          </label>
          <Input
            id={`corr-preco-${responseItemId}`}
            name="price"
            inputMode="decimal"
            placeholder="0,00"
            className="h-7 text-sm"
          />
        </div>
      ) : null}

      {fornece && conversionDefinitionId && conversionName ? (
        <div className="border-primary/20 bg-primary-soft rounded-md border p-2">
          <input type="hidden" name="conversionDefinitionId" value={conversionDefinitionId} />
          <label
            htmlFor={`corr-conversao-${responseItemId}`}
            className="text-fg-muted mb-1 block text-xs"
          >
            {conversionName}{conversionUnit ? ` (${conversionUnit})` : ""}
            {currentConversionFactor !== null
              ? ` (atual: ${currentConversionFactor.toLocaleString("pt-BR")})`
              : ""}
          </label>
          <Input
            id={`corr-conversao-${responseItemId}`}
            name="conversionFactor"
            inputMode="decimal"
            required={conversionRequired && currentConversionFactor === null}
            placeholder="Deixe vazio para manter o valor atual"
            className="h-7 text-sm"
          />
        </div>
      ) : null}

      <Input
        name="notes"
        maxLength={300}
        placeholder="Observação (opcional)"
        className="h-7 text-sm"
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`corr-motivo-${responseItemId}`}
          className="text-fg-muted text-xs"
        >
          Motivo <span className="text-destructive">*</span>
        </label>
        <Input
          id={`corr-motivo-${responseItemId}`}
          name="reason"
          required
          maxLength={300}
          placeholder="Ex.: fornecedor confirmou por telefone"
          className="h-7 text-sm"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <p className="text-fg-subtle text-xs">
        Fica registrado o que mudou, o motivo e quem corrigiu.
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
