"use client";

import { PhoneCall } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  confirmOrderManually,
  type OrderActionState,
} from "@/features/orders/actions";

const CHANNELS = [
  { value: "phone", label: "Ligação telefônica" },
  { value: "whatsapp", label: "Conversa no WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "in_person", label: "Pessoalmente" },
  { value: "other", label: "Outro canal" },
];

export function ManualOrderConfirmationDialog({
  orderId,
  revisionId,
  orderNumber,
  supplierName,
}: {
  orderId: string;
  revisionId: string;
  orderNumber: number;
  supplierName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const submit = React.useCallback(
    async (previous: OrderActionState, formData: FormData) => {
      const result = await confirmOrderManually(previous, formData);
      if (!result.error) setOpen(false);
      return result;
    },
    [],
  );
  const [state, action] = useActionState<OrderActionState, FormData>(submit, {
    error: null,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <PhoneCall className="size-3.5" aria-hidden />
          Confirmar manualmente
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" impedirFechamentoAcidental>
        <DialogHeader>
          <DialogTitle>Confirmar pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Registre o aceite recebido diretamente de {supplierName}. O pedido
            será liberado para recebimento sem indicar que o link foi aberto.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="contents">
          <DialogBody className="grid gap-4">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="revisionId" value={revisionId} />
            <div className="grid gap-1.5">
              <label
                htmlFor="manual-confirmation-channel"
                className="text-fg text-sm font-medium"
              >
                Como o fornecedor confirmou?
              </label>
              <ThemedSelect
                id="manual-confirmation-channel"
                name="channel"
                defaultValue="phone"
                required
                options={CHANNELS}
              />
            </div>
            <div className="grid gap-1.5">
              <label
                htmlFor="manual-confirmation-notes"
                className="text-fg text-sm font-medium"
              >
                Observação
              </label>
              <Input
                id="manual-confirmation-notes"
                name="notes"
                maxLength={500}
                placeholder="Ex.: João confirmou quantidades e entrega por telefone"
              />
              <p className="text-fg-subtle text-xs">
                Opcional, mas útil para consultar o combinado depois.
              </p>
            </div>
            {state.error ? (
              <p
                className="bg-destructive-soft text-destructive rounded-lg px-3 py-2 text-sm"
                role="alert"
              >
                {state.error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" size="sm" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <ConfirmButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Confirmando…" : "Registrar confirmação"}
    </Button>
  );
}
