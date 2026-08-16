"use client";

import { CheckCircle2, Pencil, XCircle } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import {
  ErrorLine,
  OrderItemRows,
  paraCampo,
  Submit,
  type ItemSeed,
  type OrderableProduct,
} from "@/components/orders/order-item-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelOrder,
  createOrderRevision,
  updateDraftOrder,
  type OrderActionState,
} from "@/features/orders/actions";

export type EditableItem = {
  id: string;
  productId: string;
  allocationId: string | null;
  productName: string;
  requestedQuantity: number;
  agreedPrice: number;
  notes: string | null;
};

/** Item do banco vira linha de formulário, com os números já em pt-BR. */
function paraSeeds(items: EditableItem[], manterId: boolean): ItemSeed[] {
  return items.map((item) => ({
    itemId: manterId ? item.id : undefined,
    allocationId: item.allocationId,
    productId: item.productId,
    productName: item.productName,
    quantity: paraCampo(item.requestedQuantity, 3).replace(/,?0+$/, ""),
    price: paraCampo(item.agreedPrice),
    notes: item.notes ?? "",
  }));
}

function DeliveryField({ defaultValue }: { defaultValue: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 sm:max-w-56">
      <label htmlFor="deliveryDueDate" className="text-fg-muted text-xs">
        Entrega prevista <span className="text-fg-subtle">(opcional)</span>
      </label>
      <Input
        id="deliveryDueDate"
        name="deliveryDueDate"
        type="date"
        defaultValue={defaultValue ?? ""}
        className="h-8"
      />
    </div>
  );
}

/**
 * Correção do pedido enquanto ele ainda não saiu daqui.
 *
 * Fica fechado por padrão: a maior parte das visitas a um rascunho é para
 * enviá-lo, não para mexer nele, e um formulário aberto competiria com o botão
 * de enviar.
 */
export function EditDraftForm({
  orderId,
  revisionId,
  deliveryDueDate,
  items,
  products,
}: {
  orderId: string;
  revisionId: string;
  deliveryDueDate: string | null;
  items: EditableItem[];
  products: OrderableProduct[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    updateDraftOrder,
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
      >
        <Pencil className="size-3.5" aria-hidden /> Editar itens e prazo
      </Button>
    );
  }

  if (state.savedAt) {
    return (
      <p className="border-border bg-success-soft text-success flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        Rascunho atualizado. Recarregue para ver os novos números.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface-sunken flex flex-col gap-4 rounded-lg border p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="revisionId" value={revisionId} />

      <DeliveryField defaultValue={deliveryDueDate} />
      <OrderItemRows products={products} seeds={paraSeeds(items, true)} />

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          Item removido daqui some do pedido. Trocar o produto de um item é
          removê-lo e acrescentar outro.
        </p>
        <div className="flex items-center gap-2">
          <Submit label="Salvar rascunho" busy="Salvando…" />
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
      </div>
    </form>
  );
}

/**
 * Nova revisão de um pedido já enviado.
 *
 * Parte dos itens da revisão vigente porque a mudança costuma ser de um número
 * só — a quantidade que o fornecedor disse que não tem. A revisão nasce em
 * rascunho e ainda precisa ser enviada.
 */
export function NewRevisionForm({
  orderId,
  deliveryDueDate,
  items,
  products,
}: {
  orderId: string;
  deliveryDueDate: string | null;
  items: EditableItem[];
  products: OrderableProduct[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    createOrderRevision,
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
      >
        <Pencil className="size-3.5" aria-hidden /> Criar nova revisão
      </Button>
    );
  }

  if (state.savedAt) {
    return (
      <p className="border-border bg-success-soft text-success flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        Revisão criada em rascunho. Recarregue para enviá-la ao fornecedor.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface-sunken flex flex-col gap-4 rounded-lg border p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <DeliveryField defaultValue={deliveryDueDate} />
      <OrderItemRows products={products} seeds={paraSeeds(items, false)} />

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          A revisão anterior fica no histórico com o que o fornecedor confirmou.
          A nova nasce em rascunho e precisa de link novo.
        </p>
        <div className="flex items-center gap-2">
          <Submit label="Criar revisão" busy="Criando…" />
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
      </div>
    </form>
  );
}

/**
 * Cancelamento.
 *
 * Pede motivo porque cancelar é decisão, não conserto — e porque o motivo é o
 * que explica, seis meses depois, um pedido que existe e não aconteceu.
 */
export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    cancelOrder,
    { error: null },
  );

  if (state.savedAt) {
    return (
      <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
        Pedido cancelado. O link do fornecedor foi revogado.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive gap-1.5"
        onClick={() => setOpen(true)}
      >
        <XCircle className="size-3.5" aria-hidden /> Cancelar pedido
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <h2 className="text-fg text-sm font-semibold">Cancelar pedido</h2>
        <p className="text-fg-muted mt-1 text-sm">
          O link do fornecedor deixa de funcionar e as revisões vivas são
          canceladas. Se já houve entrega, o caminho é encerrar saldo.
        </p>
      </div>

      <Input
        name="reason"
        required
        maxLength={300}
        placeholder="Motivo do cancelamento"
      />

      <ErrorLine error={state.error} />

      <div className="flex items-center gap-2">
        <Submit label="Cancelar pedido" busy="Cancelando…" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle"
          onClick={() => setOpen(false)}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
}
