"use client";

import { ShoppingBag } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  allocateItem,
  confirmAllocations,
  type AllocationState,
} from "@/features/allocations/actions";

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

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
}: {
  roundId: string;
  quotationItemId: string;
  productName: string;
  purchaseUnit: string;
  suppliers: { id: string; name: string; price: number }[];
  suggestedQuantity: number;
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
        {suppliers.length === 0 ? "Sem resposta com preço" : "Decidir compra"}
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
          <select
            id={`forn-${quotationItemId}`}
            name="supplierId"
            required
            className={selectClass}
          >
            <option value="">Selecione…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.price.toFixed(2).replace(".", ",")}
              </option>
            ))}
          </select>
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
          é um passo separado, em cada pedido. As decisões, essas sim, não podem
          mais ser alteradas.
        </p>
        <Submit label="Confirmar e gerar" busy="Gerando…" />
      </div>
    </form>
  );
}
