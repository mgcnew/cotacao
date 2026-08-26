"use client";

import { ChevronDown, PackageCheck } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
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
import { cn } from "@/lib/utils";

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
  const [showDetails, setShowDetails] = React.useState(false);
  const router = useRouter();
  const action = React.useCallback(
    async (previous: ReceiptActionState, formData: FormData) => {
      const result = await registerOrderArrival(previous, formData);
      return result;
    },
    [],
  );
  const [state, formAction, pending] = useActionState(action, { error: null });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && state.savedAt) router.refresh();
  }

  function finish() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full gap-1.5 sm:w-auto">
          <PackageCheck className="size-3.5" aria-hidden /> Registrar chegada
        </Button>
      </DialogTrigger>
      <DialogContent size="md" impedirFechamentoAcidental={!state.savedAt}>
        <DialogHeader>
          <DialogTitle>Chegada do pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Mercadoria de {supplierName}. Isto apenas abre a conferência; saldo,
            quantidades e valores continuam intactos até ela ser finalizada.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="contents">
          {state.savedAt ? (
            <DialogBody>
              <SuccessLine message="Chegada registrada. O pedido ficou disponível para conferência." />
            </DialogBody>
          ) : (
            <DialogBody className="flex flex-col gap-4">
              <input type="hidden" name="orderId" value={orderId} />
              <div className="border-border bg-surface-sunken rounded-xl border px-3 py-2.5 sm:hidden">
                <p className="text-fg text-sm font-medium">Chegada agora</p>
                <p className="text-fg-muted mt-0.5 text-xs">
                  Ao confirmar, o sistema registra automaticamente a data e o
                  horário atuais.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-between sm:hidden"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((current) => !current)}
              >
                {showDetails
                  ? "Ocultar dados opcionais"
                  : "Adicionar dados da nota"}
                <ChevronDown
                  className={cn(
                    "transition-transform",
                    showDetails && "rotate-180",
                  )}
                  aria-hidden
                />
              </Button>
              <div
                className={cn(
                  "space-y-4",
                  showDetails ? "block" : "hidden",
                  "sm:block",
                )}
              >
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
                      <span className="text-fg-subtle font-normal">
                        (opcional)
                      </span>
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
                      <span className="text-fg-subtle font-normal">
                        (opcional)
                      </span>
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
                      <span className="text-fg-subtle font-normal">
                        (opcional)
                      </span>
                    </label>
                    <Input
                      id={`total-${orderId}`}
                      name="invoiceTotal"
                      inputMode="decimal"
                      placeholder="4.850,00"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-1.5">
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
              </div>
              <ErrorLine error={state.error} />
            </DialogBody>
          )}
          <DialogFooter>
            {state.savedAt ? (
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={finish}
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
                  {pending ? "Registrando…" : "Confirmar chegada"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
