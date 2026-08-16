"use client";

import { useActionState } from "react";

import {
  ErrorLine,
  OrderItemRows,
  selectClass,
  Submit,
  type OrderableProduct,
} from "@/components/orders/order-item-rows";
import { Input } from "@/components/ui/input";
import {
  createDirectOrder,
  type OrderActionState,
} from "@/features/orders/actions";

/** Pedido direto, sem cotação. */
export function DirectOrderForm({
  suppliers,
  products,
}: {
  suppliers: { id: string; name: string }[];
  products: OrderableProduct[];
}) {
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    createDirectOrder,
    { error: null },
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="supplierId" className="text-fg text-sm font-medium">
            Fornecedor
          </label>
          <select id="supplierId" name="supplierId" required className={selectClass}>
            <option value="">Selecione…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="deliveryDueDate"
            className="text-fg text-sm font-medium"
          >
            Entrega prevista{" "}
            <span className="text-fg-subtle font-normal">(opcional)</span>
          </label>
          <Input
            id="deliveryDueDate"
            name="deliveryDueDate"
            type="date"
            className="h-8"
          />
        </div>
      </div>

      <OrderItemRows
        products={products}
        seeds={[{ productId: "", quantity: "", price: "", notes: "" }]}
      />

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          As unidades vêm do cadastro do produto. O pedido nasce em rascunho —
          criar não envia nada ao fornecedor.
        </p>
        <Submit label="Criar pedido" busy="Criando…" />
      </div>
    </form>
  );
}
