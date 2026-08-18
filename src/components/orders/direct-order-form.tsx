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

export type DirectOrderOptions = {
  suppliers: { id: string; name: string }[];
  products: OrderableProduct[];
};

/**
 * Os campos do pedido direto.
 *
 * Separados do formulário porque existem em dois lugares — a página
 * `/pedidos/novo` e o modal da lista — e são os mesmos campos com o mesmo
 * texto. O que muda é o que acontece depois de salvar.
 *
 * `idPrefixo` porque `id` tem que ser único na página: com o modal aberto por
 * cima da lista, dois campos "supplierId" quebrariam a associação do `<label>`.
 */
export function CamposDoPedidoDireto({
  suppliers,
  products,
  idPrefixo = "",
}: DirectOrderOptions & { idPrefixo?: string }) {
  const idFornecedor = `${idPrefixo}supplierId`;
  const idPrazo = `${idPrefixo}deliveryDueDate`;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFornecedor} className="text-fg text-sm font-medium">
            Fornecedor
          </label>
          <select
            id={idFornecedor}
            name="supplierId"
            required
            className={selectClass}
          >
            <option value="">Selecione…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idPrazo} className="text-fg text-sm font-medium">
            Entrega prevista{" "}
            <span className="text-fg-subtle font-normal">(opcional)</span>
          </label>
          <Input
            id={idPrazo}
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
    </>
  );
}

/**
 * Pedido direto na página própria.
 *
 * Aqui, criar abre o pedido: quem chegou em `/pedidos/novo` veio criar e vai
 * querer enviá-lo em seguida. É o `apos=abrir` que diz isso à action.
 */
export function DirectOrderForm({ suppliers, products }: DirectOrderOptions) {
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    createDirectOrder,
    { error: null },
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5"
    >
      <input type="hidden" name="apos" value="abrir" />
      <CamposDoPedidoDireto suppliers={suppliers} products={products} />

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
