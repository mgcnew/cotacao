"use client";

import { PackageCheck } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
  registerOrderArrival,
  type ReceiptActionState,
} from "@/features/receipts/actions";

export function ArrivalDialog({
  orderId,
  orderNumber,
  supplierName,
}: {
  orderId: string;
  orderNumber: number;
  supplierName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const action = React.useCallback(
    async (previous: ReceiptActionState, formData: FormData) => {
      const result = await registerOrderArrival(previous, formData);
      if (!result.error) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    [router],
  );
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <PackageCheck className="size-3.5" aria-hidden /> Registrar chegada
        </Button>
      </DialogTrigger>
      <DialogContent size="md" impedirFechamentoAcidental>
        <DialogHeader>
          <DialogTitle>Chegada do pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Mercadoria de {supplierName}. Isto apenas abre a conferência; saldo,
            quantidades e valores continuam intactos até ela ser finalizada.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <input type="hidden" name="orderId" value={orderId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`arrival-${orderId}`}
                  className="text-fg text-sm font-medium"
                >
                  Data e hora
                </label>
                <DateTimePicker
                  id={`arrival-${orderId}`}
                  name="receivedAt"
                  placeholder="Escolher data e hora"
                />
                <p className="text-fg-subtle text-xs">
                  Em branco: usa o horário atual.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`invoice-${orderId}`}
                  className="text-fg text-sm font-medium"
                >
                  Número da nota{" "}
                  <span className="text-fg-subtle font-normal">(opcional)</span>
                </label>
                <Input
                  id={`invoice-${orderId}`}
                  name="invoiceNumber"
                  maxLength={60}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`series-${orderId}`}
                  className="text-fg text-sm font-medium"
                >
                  Série{" "}
                  <span className="text-fg-subtle font-normal">(opcional)</span>
                </label>
                <Input
                  id={`series-${orderId}`}
                  name="invoiceSeries"
                  maxLength={20}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`total-${orderId}`}
                  className="text-fg text-sm font-medium"
                >
                  Total da nota{" "}
                  <span className="text-fg-subtle font-normal">(opcional)</span>
                </label>
                <Input
                  id={`total-${orderId}`}
                  name="invoiceTotal"
                  inputMode="decimal"
                  placeholder="4.850,00"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`arrival-notes-${orderId}`}
                className="text-fg text-sm font-medium"
              >
                Observação{" "}
                <span className="text-fg-subtle font-normal">(opcional)</span>
              </label>
              <Input
                id={`arrival-notes-${orderId}`}
                name="notes"
                maxLength={500}
              />
            </div>
            <ErrorLine error={state.error} />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" size="sm" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              className="ml-auto"
              disabled={pending}
            >
              {pending ? "Registrando…" : "Confirmar chegada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
