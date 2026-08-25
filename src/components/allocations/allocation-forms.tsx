"use client";

import { ShoppingBag } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  allocateItem,
  confirmAllocations,
  allocateBestPrices,
  type AllocationState,
  type RecommendationState,
} from "@/features/allocations/actions";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

/** Decide de quem comprar um item, e quanto. */
export function AllocateForm({
  roundId,
  quotationItemId,
  productName,
  purchaseUnit,
  suppliers,
  suggestedQuantity,
  initialSupplierId,
  buttonLabel = "Decidir compra",
}: {
  roundId: string;
  quotationItemId: string;
  productName: string;
  purchaseUnit: string;
  suppliers: { id: string; name: string; price: number }[];
  suggestedQuantity: number;
  initialSupplierId?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<AllocationState, FormData>(
    allocateItem,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        disabled={suppliers.length === 0}
      >
        <ShoppingBag className="size-3.5" aria-hidden />
        {suppliers.length === 0 ? "Sem resposta com preço" : buttonLabel}
      </Button>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken flex flex-col gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="quotationItemId" value={quotationItemId} />

      <p className="text-fg-subtle text-xs">{productName}</p>

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`forn-${quotationItemId}`}
            className="text-fg-muted text-xs"
          >
            Fornecedor
          </label>
          <ThemedSelect
            id={`forn-${quotationItemId}`}
            name="supplierId"
            required
            defaultValue={initialSupplierId ?? ""}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.name} — ${supplier.price.toFixed(2).replace(".", ",")}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`qtd-${quotationItemId}`}
            className="text-fg-muted text-xs"
          >
            Quantidade ({purchaseUnit})
          </label>
          <Input
            id={`qtd-${quotationItemId}`}
            name="quantity"
            required
            inputMode="decimal"
            defaultValue={String(suggestedQuantity).replace(".", ",")}
            className="h-8"
          />
        </div>
      </div>

      <Input
        name="reason"
        maxLength={200}
        placeholder="Motivo da escolha (opcional)"
        className="h-8"
      />

      <ErrorLine error={state.error} />

      <p className="text-fg-subtle text-xs">
        O preço é o vigente da resposta, já com negociação. Para dividir o item,
        repita a decisão escolhendo outro fornecedor.
      </p>

      <div className="flex items-center gap-2">
        <Submit label="Alocar" busy="Alocando…" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Fechar
        </Button>
      </div>
    </form>
  );
}

/** Aceita em lote somente os itens ainda sem decisão. */
export function ApplyRecommendationsForm({
  roundId,
  itemCount,
}: {
  roundId: string;
  itemCount: number;
}) {
  const [state, formAction] = useActionState<RecommendationState, FormData>(
    allocateBestPrices,
    { error: null },
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="roundId" value={roundId} />
      <Submit
        label={`Aplicar ${itemCount === 1 ? "recomendação" : `${itemCount} recomendações`}`}
        busy="Aplicando…"
      />
      <ErrorLine error={state.error} />
      <SuccessLine
        message={
          state.savedAt
            ? `${state.createdCount ?? itemCount} decisões adicionadas ao rascunho.`
            : null
        }
      />
    </form>
  );
}

/** Confirma tudo o que está em rascunho e gera um pedido por fornecedor. */
export function ConfirmOrdersForm({
  roundId,
  draftCount,
  supplierCount,
}: {
  roundId: string;
  draftCount: number;
  supplierCount: number;
}) {
  const [state, formAction] = useActionState<AllocationState, FormData>(
    confirmAllocations,
    { error: null },
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div>
        <h2 className="text-fg text-sm font-semibold">Gerar pedidos</h2>
        <p className="text-fg-muted mt-1 text-sm">
          {draftCount} {draftCount === 1 ? "decisão" : "decisões"} em rascunho,
          que vão virar {supplierCount}{" "}
          {supplierCount === 1 ? "pedido" : "pedidos"} — um por fornecedor.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-56">
        <label htmlFor="deliveryDueDate" className="text-fg-muted text-xs">
          Entrega prevista <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input id="deliveryDueDate" name="deliveryDueDate" type="date" />
      </div>

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          Gerar não envia. Os pedidos nascem em rascunho — o envio ao fornecedor
          é um passo separado, em cada pedido. Se esta for a última decisão, a
          rodada será concluída automaticamente; se houver algo em aberto, a
          tela mostrará exatamente o que falta.
        </p>
        <Submit label="Confirmar e gerar" busy="Gerando…" />
      </div>
    </form>
  );
}
