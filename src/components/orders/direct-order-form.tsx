"use client";

import { AlertTriangle, ArrowRight, Bell, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useFechaModalAoConcluir, useModalDeRota } from "@/components/layout/route-modal";
import {
  ErrorLine,
  OrderItemRows,
  selectClass,
  Submit,
  type OrderableProduct,
} from "@/components/orders/order-item-rows";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createDirectOrder,
  type OrderActionState,
} from "@/features/orders/actions";
import {
  formatSupplierNoticeDate,
  isSupplierNoticeOverdue,
  SUPPLIER_NOTICE_KIND_LABEL,
  type SupplierNoticeKind,
} from "@/features/suppliers/notices";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export type DirectOrderOptions = {
  suppliers: {
    id: string;
    name: string;
    openNotices: {
      id: string;
      kind: string;
      title: string;
      amount: number | null;
      dueDate: string | null;
      priority: string;
    }[];
  }[];
  products: OrderableProduct[];
  shoppingItems?: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    purchaseUnit: string;
    notes: string;
    isActive: boolean;
  }[];
};

/**
 * Os campos do pedido direto.
 *
 * `idPrefixo` porque `id` tem que ser único na página: com o modal aberto por
 * cima da lista, dois campos "supplierId" quebrariam a associação do `<label>`.
 */
export function CamposDoPedidoDireto({
  suppliers,
  products,
  shoppingItems,
  idPrefixo = "",
}: DirectOrderOptions & { idPrefixo?: string }) {
  const idFornecedor = `${idPrefixo}supplierId`;
  const idPrazo = `${idPrefixo}deliveryDueDate`;
  const [supplierId, setSupplierId] = useState("");
  const selectedSupplier =
    suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const openNotices = selectedSupplier?.openNotices ?? [];
  const hasImportantNotice = openNotices.some(
    (notice) => notice.priority === "high",
  );

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
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
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

      {selectedSupplier && openNotices.length > 0 ? (
        <section
          className={
            hasImportantNotice
              ? "border-warning/40 bg-warning/5 rounded-xl border p-3"
              : "border-border bg-surface-sunken rounded-xl border p-3"
          }
        >
          <div className="flex items-start gap-2">
            {hasImportantNotice ? (
              <AlertTriangle
                className="text-warning mt-0.5 size-4 shrink-0"
                aria-hidden
              />
            ) : (
              <Bell className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-fg text-sm font-medium">
                Revise antes de comprar de {selectedSupplier.name}
              </p>
              <ul className="text-fg-muted mt-1 space-y-1 text-sm">
                {openNotices.slice(0, 3).map((notice) => (
                  <li key={notice.id}>
                    <span className="font-medium">
                      {SUPPLIER_NOTICE_KIND_LABEL[
                        notice.kind as SupplierNoticeKind
                      ] ?? "Registro"}
                      :
                    </span>{" "}
                    {notice.title}
                    {notice.amount !== null
                      ? ` · ${CURRENCY.format(Number(notice.amount))}`
                      : ""}
                    {notice.dueDate
                      ? ` · ${
                          isSupplierNoticeOverdue(notice.dueDate)
                            ? "venceu em"
                            : "até"
                        } ${formatSupplierNoticeDate(notice.dueDate)}`
                      : ""}
                  </li>
                ))}
              </ul>
              {openNotices.length > 3 ? (
                <p className="text-fg-subtle mt-1 text-xs">
                  E mais {openNotices.length - 3} registro(s) em aberto.
                </p>
              ) : null}
              <Link
                href={`/fornecedores/${selectedSupplier.id}`}
                target="_blank"
                className="text-primary mt-2 inline-block text-xs font-medium hover:underline"
              >
                Abrir ficha do fornecedor
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <OrderItemRows
        products={products}
        shoppingItems={shoppingItems}
        seeds={[{ productId: "", quantity: "", price: "", notes: "" }]}
      />
    </>
  );
}

/**
 * O caminho barrado, com a saída — o mesmo texto na página e no modal.
 *
 * Antes eram duas redações do mesmo aviso, uma em cada lugar. Aviso que muda de
 * palavra conforme o embrulho é aviso que envelhece pela metade.
 */
export function FaltaCadastro({ suppliers, products }: DirectOrderOptions) {
  const faltaFornecedor = suppliers.length === 0;
  if (!faltaFornecedor && products.length > 0) return null;

  return (
    <div className="border-border bg-surface-sunken flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
      <PackagePlus className="text-fg-subtle size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">
          Falta cadastro para montar o pedido
        </p>
        <p className="text-fg-muted text-sm">
          {faltaFornecedor
            ? "Nenhum fornecedor ativo. Cadastre o fornecedor antes de comprar dele."
            : "Nenhum produto ativo. O pedido grava as unidades do cadastro do produto, então ele precisa existir primeiro."}
        </p>
      </div>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href={faltaFornecedor ? "/fornecedores/novo" : "/produtos/novo"}>
          {faltaFornecedor ? "Cadastrar fornecedor" : "Cadastrar produto"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

/**
 * O formulário do pedido direto — um só, para os dois embrulhos.
 *
 * Antes eram dois caminhos para a mesma operação: `/pedidos/novo` numa página e
 * um modal na lista. Os campos já eram os mesmos; o que divergia era o que
 * acontece depois de criar, e isso não justifica dois fluxos.
 *
 * Agora o componente pergunta onde está — `useModalDeRota()` devolve `null`
 * fora do modal — e adapta as duas únicas coisas que realmente mudam:
 *
 *  - NA PÁGINA, criar abre o pedido. Quem digitou o endereço veio criar e vai
 *    querer enviá-lo em seguida; é o `apos=abrir` que diz isso à action.
 *  - NO MODAL, criar fecha e devolve a lista, que já vem com o pedido novo.
 *
 * O resto — campos, validação, action, mensagem de erro — é literalmente o
 * mesmo código nos dois casos.
 */
export function DirectOrderForm({ suppliers, products, shoppingItems }: DirectOrderOptions) {
  const modal = useModalDeRota();
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    useFechaModalAoConcluir(createDirectOrder),
    { error: null },
  );

  const campos = (
    <CamposDoPedidoDireto
      suppliers={suppliers}
      products={products}
      shoppingItems={shoppingItems}
      idPrefixo={modal ? "modal-" : ""}
    />
  );

  const rodape = (
    <>
      <Submit label="Criar pedido" busy="Criando…" />
      <p className="text-fg-subtle text-xs">
        As unidades vêm do cadastro do produto. Nasce em rascunho — criar não
        envia nada ao fornecedor.
      </p>
    </>
  );

  if (modal) {
    return (
      <form action={formAction} className="contents">
        <DialogBody className="flex flex-col gap-4">
          {campos}
          <ErrorLine error={state.error} />
        </DialogBody>
        <DialogFooter>{rodape}</DialogFooter>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5"
    >
      <input type="hidden" name="apos" value="abrir" />
      {campos}
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rodape}
      </div>
    </form>
  );
}
