"use client";

import { ShoppingBag } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  allocateItem,
  confirmAllocations,
  allocateBestPrices,
  type AllocationState,
  type RecommendationState,
} from "@/features/allocations/actions";

const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Mesmo parse do servidor: ponto é milhar, vírgula é decimal. */
function parseQuantity(raw: string): number {
  return Number(raw.trim().replace(/\./g, "").replace(",", "."));
}

function Submit({
  label,
  busy,
  disabled = false,
}: {
  label: string;
  busy: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} className="h-11 sm:h-9">
      {pending ? busy : label}
    </Button>
  );
}

type Candidate = {
  id: string;
  name: string;
  price: number;
  /** Multiplica a quantidade comprada até a unidade do preço; nulo = sem conversão. */
  pricingFactor?: number | null;
};

type DecidedQuantity = { supplierId: string; quantity: number; status: string };

/** Decide de quem comprar um item, e quanto. */
export function AllocateForm({
  roundId,
  quotationItemId,
  productName,
  purchaseUnit,
  pricingUnit,
  requiresPricingConversion,
  estimatedConversionRate,
  suppliers,
  suggestedQuantity,
  initialSupplierId,
  buttonLabel = "Decidir compra",
  requestedQuantity,
  decided = [],
}: {
  roundId: string;
  quotationItemId: string;
  productName: string;
  purchaseUnit: string;
  pricingUnit: string;
  requiresPricingConversion: boolean;
  estimatedConversionRate: number | null;
  suppliers: Candidate[];
  suggestedQuantity: number;
  initialSupplierId?: string;
  buttonLabel?: string;
  /** Quantidade pedida do item: o teto da soma de todas as escolhas. */
  requestedQuantity: number;
  /** Escolhas já existentes (rascunho e confirmadas), de qualquer fornecedor. */
  decided?: DecidedQuantity[];
}) {
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState(
    initialSupplierId ?? suppliers[0]?.id ?? "",
  );
  const [quantity, setQuantity] = React.useState(
    String(suggestedQuantity).replace(".", ","),
  );
  const [state, formAction] = useActionState<AllocationState, FormData>(
    allocateItem,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-1.5 sm:h-9"
        aria-label={`${buttonLabel}: ${productName}`}
        onClick={() => setOpen(true)}
        disabled={suppliers.length === 0}
      >
        <ShoppingBag className="size-4" aria-hidden />
        {suppliers.length === 0 ? "Sem resposta com preço" : buttonLabel}
      </Button>
    );
  }

  // O rascunho do mesmo fornecedor é substituído pelo novo valor; o resto conta.
  const others = decided
    .filter((entry) => !(entry.status === "draft" && entry.supplierId === supplierId))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const balance = Math.max(0, requestedQuantity - others);
  const typed = parseQuantity(quantity);
  const valid = Number.isFinite(typed) && typed > 0;
  const over = valid && typed > balance + 1e-9;
  const selected = suppliers.find((candidate) => candidate.id === supplierId);
  const factor =
    selected?.pricingFactor === undefined
      ? requiresPricingConversion
        ? estimatedConversionRate
        : 1
      : selected.pricingFactor;
  const estimatedTotal =
    valid && !over && selected && factor !== null && factor !== undefined
      ? typed * factor * selected.price
      : null;
  const dotAsThousand = /\./.test(quantity) && !/,/.test(quantity);

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken flex w-full basis-full flex-col gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="quotationItemId" value={quotationItemId} />

      <p className="text-fg text-sm font-medium">{productName}</p>

      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`forn-${quotationItemId}`}
            className="text-fg text-sm font-medium"
          >
            Fornecedor
          </label>
          <ThemedSelect
            id={`forn-${quotationItemId}`}
            name="supplierId"
            required
            value={supplierId}
            onValueChange={setSupplierId}
            className="h-11 sm:h-9"
            options={suppliers.map((supplier, index) => ({
              value: supplier.id,
              label: `${supplier.name} — ${MONEY.format(supplier.price)}/${pricingUnit}${index === 0 ? " · menor preço" : ""}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`qtd-${quotationItemId}`}
            className="text-fg text-sm font-medium"
          >
            Quantidade ({purchaseUnit})
          </label>
          <Input
            id={`qtd-${quotationItemId}`}
            name="quantity"
            required
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={over}
            aria-describedby={`saldo-${quotationItemId}`}
            className="h-11 tabular-nums sm:h-9"
          />
        </div>
      </div>

      <div
        id={`saldo-${quotationItemId}`}
        aria-live="polite"
        className="flex flex-col gap-1 text-[13px] tabular-nums"
      >
        <p className="text-fg-muted">
          Pedido {QTY.format(requestedQuantity)} {purchaseUnit} · já decidido{" "}
          {QTY.format(others)} · saldo{" "}
          <strong className="text-fg">
            {QTY.format(balance)} {purchaseUnit}
          </strong>
        </p>
        {over ? (
          <p className="text-destructive font-medium">
            Passa do saldo em {QTY.format(typed - balance)} {purchaseUnit}. O máximo
            é {QTY.format(balance)}.
          </p>
        ) : estimatedTotal !== null ? (
          <p className="text-fg">
            {QTY.format(typed)} {purchaseUnit} ≈{" "}
            <strong>{MONEY.format(estimatedTotal)}</strong> com {selected?.name}
          </p>
        ) : valid && !over && factor === null ? (
          <p className="text-warning">Total sem conversão: informe o fator abaixo.</p>
        ) : null}
        {dotAsThousand ? (
          <p className="text-warning">
            O ponto separa milhares: {quantity} vale {QTY.format(typed)}. Para
            decimais, use vírgula (ex.: 12,5).
          </p>
        ) : null}
      </div>

      {balance > 0 && balance !== typed ? (
        <Button
          type="button"
          variant="ghost"
          className="text-primary -mt-1 h-11 self-start px-2 sm:h-9"
          onClick={() => setQuantity(String(balance).replace(".", ","))}
        >
          Usar o saldo ({QTY.format(balance)} {purchaseUnit})
        </Button>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`motivo-${quotationItemId}`}
          className="text-fg text-sm font-medium"
        >
          Motivo <span className="text-fg-muted font-normal">(opcional)</span>
        </label>
        <Input
          id={`motivo-${quotationItemId}`}
          name="reason"
          maxLength={200}
          className="h-11 sm:h-9"
        />
      </div>

      {requiresPricingConversion ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`conversao-${quotationItemId}`}
            className="text-fg text-sm font-medium"
          >
            Quantos {pricingUnit} há, em média, em 1 {purchaseUnit}?{" "}
            <span className="text-fg-muted font-normal">(opcional)</span>
          </label>
          <Input
            id={`conversao-${quotationItemId}`}
            name="conversionRate"
            inputMode="decimal"
            defaultValue={
              estimatedConversionRate === null
                ? ""
                : String(estimatedConversionRate).replace(".", ",")
            }
            placeholder={`Ex.: 45 ${pricingUnit} por ${purchaseUnit}`}
            className="h-11 sm:h-9"
          />
          <p className="text-fg-muted text-[13px]">
            Usado somente para estimar total e economia. Se o fornecedor já
            informou um fator específico, o dele tem prioridade.
          </p>
        </div>
      ) : null}

      <ErrorLine error={state.error} />

      <p className="text-fg-muted text-[13px]">
        O preço é o vigente da resposta, já com negociação. Para dividir o item
        entre fornecedores, salve esta escolha e repita com outro fornecedor.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Submit label="Salvar escolha" busy="Salvando…" disabled={over} />
        <Button
          type="button"
          variant="ghost"
          className="text-fg-muted h-11 sm:h-9"
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
    <form action={formAction} className="flex flex-col items-start gap-1.5 sm:items-end">
      <input type="hidden" name="roundId" value={roundId} />
      <Submit
        label={
          itemCount === 1
            ? "Salvar a sugestão"
            : `Salvar as ${itemCount} sugestões`
        }
        busy="Salvando…"
      />
      <ErrorLine error={state.error} />
      <SuccessLine
        message={
          state.savedAt
            ? `${state.createdCount ?? itemCount} escolhas salvas. Ainda falta gerar os pedidos.`
            : null
        }
      />
    </form>
  );
}

export type OrderPreview = {
  supplierName: string;
  itemCount: number;
  /** Nulo quando nenhum item do pedido tem total calculável. */
  total: number | null;
  withoutConversion: number;
  items: { name: string; quantity: string }[];
};

/**
 * Barra de fechamento da decisão.
 *
 * Fica presa à base da tela e diz, em reais, o que vai ser comprado. O botão
 * não gera nada direto: abre um resumo por fornecedor, porque gerar pedidos é o
 * ponto sem volta desta tela.
 */
export function ConfirmOrdersBar({
  roundId,
  draftCount,
  orders,
  grandTotal,
  withoutConversion,
}: {
  roundId: string;
  draftCount: number;
  orders: OrderPreview[];
  grandTotal: number;
  withoutConversion: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [handledAt, setHandledAt] = React.useState<number | undefined>();
  const [state, formAction, pending] = useActionState<AllocationState, FormData>(
    confirmAllocations,
    { error: null },
  );

  // Gerou: fecha o resumo (a página já está sendo revalidada com os pedidos).
  if (state.savedAt && state.savedAt !== handledAt) {
    setHandledAt(state.savedAt);
    setOpen(false);
  }

  const orderLabel = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`;
  const itemLabel = `${draftCount} ${draftCount === 1 ? "item" : "itens"}`;
  const totalLabel = `${MONEY.format(grandTotal)}${withoutConversion > 0 ? "+" : ""}`;

  return (
    <>
      <div className="border-border bg-surface sticky bottom-0 z-20 mt-6 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-16px_rgba(0,0,0,.45)] sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fg text-sm font-semibold tabular-nums">
              {orderLabel} · {itemLabel} ·{" "}
              <span className="text-base">{totalLabel}</span>
            </p>
            <p className="text-fg-muted text-[13px]">
              {withoutConversion > 0
                ? `${withoutConversion} ${withoutConversion === 1 ? "item" : "itens"} sem conversão, fora do total. `
                : ""}
              Gerar não envia ao fornecedor.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-11 shrink-0"
            onClick={() => setOpen(true)}
          >
            Revisar e gerar pedidos
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" impedirFechamentoAcidental={pending}>
          <DialogHeader>
            <DialogTitle>
              Gerar {orderLabel} · {totalLabel}
            </DialogTitle>
            <DialogDescription>
              Confira o que vai ser comprado. Cada pedido nasce em rascunho; o
              envio ao fornecedor é um passo separado, em cada pedido.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <ul className="border-border divide-border divide-y overflow-hidden rounded-lg border">
              {orders.map((order) => (
                <li key={order.supplierName} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-fg font-semibold wrap-anywhere">
                      {order.supplierName}
                    </span>
                    <span className="text-fg font-semibold tabular-nums">
                      {order.total === null ? "sem conversão" : MONEY.format(order.total)}
                      {order.withoutConversion > 0 && order.total !== null ? "+" : ""}
                    </span>
                  </div>
                  <p className="text-fg-muted text-[13px]">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}:{" "}
                    {order.items.map((item) => `${item.name} (${item.quantity})`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>

            <form id="confirm-orders-form" action={formAction} className="flex flex-col gap-3">
              <input type="hidden" name="roundId" value={roundId} />
              <div className="flex flex-col gap-1.5 sm:max-w-56">
                <label htmlFor="deliveryDueDate" className="text-fg text-sm font-medium">
                  Entrega prevista <span className="text-fg-muted font-normal">(opcional)</span>
                </label>
                <Input id="deliveryDueDate" name="deliveryDueDate" type="date" className="h-11 sm:h-9" />
              </div>
              <ErrorLine error={state.error} />
              <p className="text-fg-muted text-[13px]">
                Se esta for a última decisão, a rodada será concluída
                automaticamente; se houver algo em aberto, a tela mostra
                exatamente o que falta.
              </p>
            </form>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="confirm-orders-form"
              className="h-11 sm:h-9"
              disabled={pending}
            >
              {pending ? "Gerando…" : `Gerar ${orderLabel} (${totalLabel})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
