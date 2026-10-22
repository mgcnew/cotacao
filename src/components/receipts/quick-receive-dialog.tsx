"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  receiveOrderAsOrdered,
  type ReceiptActionState,
} from "@/features/receipts/actions";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/**
 * "Chegou conforme pedido": dá a baixa de todo o saldo de uma vez, sem nota.
 *
 * É para o pedido que chegou certo e não pôde ser conferido no dia. As
 * quantidades são as do pedido; o preço de cada item fica como "a confirmar" e
 * aparece na fila de Recebimentos até a nota chegar. Se chegou menos, ou
 * diferente, o caminho é "Registrar chegada" e a conferência normal — este
 * botão não pergunta quantidade justamente para ser um toque só.
 */
export function QuickReceiveDialog({
  orderId,
  orderNumber,
  supplierName,
  defaultDay,
  maxDay,
  items,
}: {
  orderId: string;
  orderNumber: number;
  supplierName: string;
  /** AAAA-MM-DD: a data prevista de entrega, ou hoje quando não há. */
  defaultDay: string;
  /** AAAA-MM-DD: hoje, no fuso da empresa — não se dá baixa no futuro. */
  maxDay: string;
  items: { id: string; name: string; quantity: number; unit: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ReceiptActionState,
    FormData
  >(receiveOrderAsOrdered, { error: null });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && state.savedAt) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 sm:w-auto"
        >
          <ClipboardCheck className="size-3.5" aria-hidden /> Chegou conforme
          pedido
        </Button>
      </DialogTrigger>
      <DialogContent size="md" impedirFechamentoAcidental={!state.savedAt}>
        <DialogHeader>
          <DialogTitle>Chegou conforme pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Mercadoria de {supplierName}. Dá a baixa de todo o saldo com as
            quantidades do pedido.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="contents">
          {state.savedAt ? (
            <DialogBody>
              <SuccessLine message="Baixa feita. Os preços ficaram “a confirmar” até a nota chegar." />
            </DialogBody>
          ) : (
            <DialogBody className="flex flex-col gap-4">
              <input type="hidden" name="orderId" value={orderId} />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`quick-day-${orderId}`}
                  className="text-fg text-sm font-medium"
                >
                  Dia em que chegou
                </label>
                <Input
                  id={`quick-day-${orderId}`}
                  name="receivedDay"
                  type="date"
                  defaultValue={defaultDay}
                  max={maxDay}
                  required
                />
                <p className="text-fg-subtle text-xs">
                  Já vem com a data prevista. Corrija se a entrega atrasou: é
                  esse dia que mede a pontualidade do fornecedor.
                </p>
              </div>
              <ul className="border-border divide-border divide-y rounded-xl border text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-fg min-w-0">{item.name}</span>
                    <span className="text-fg-muted shrink-0 tabular-nums">
                      {QTY.format(item.quantity)} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="bg-warning-soft text-warning rounded-md px-3 py-2 text-xs">
                Os preços ficam como <strong>a confirmar</strong>: valem o
                combinado por enquanto e não abrem divergência. Confirme com a
                nota em “Preços a confirmar”.
              </p>
              <ErrorLine error={state.error} />
            </DialogBody>
          )}
          <DialogFooter>
            {state.savedAt ? (
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Concluir
              </Button>
            ) : (
              <>
                <DialogClose asChild>
                  <Button type="button" size="sm" variant="ghost">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  size="sm"
                  className="ml-auto w-full sm:w-auto"
                  disabled={pending}
                >
                  {pending ? "Dando baixa…" : "Dar baixa"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
