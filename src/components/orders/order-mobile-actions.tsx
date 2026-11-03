"use client";

import { Send } from "lucide-react";
import * as React from "react";

import {
  SendOrderControls,
  type SendContact,
} from "@/components/orders/send-order-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** O botão principal da barra: largo, alto o bastante para o polegar. */
export const MOBILE_ACTION_CLASS = "h-12 w-full text-base pointer-coarse:h-12";

/**
 * O envio do pedido no celular, numa folha.
 *
 * Inline, os controles de envio (WhatsApp, link, mensagem, "marquei como
 * enviado") somam mais de uma tela de rolagem, depois dos itens — e o pedido
 * ficava esperando lá embaixo. Aqui eles são os mesmos, só que abertos pelo
 * botão da barra; quando o pedido sai, a folha fecha e a página já vem
 * atualizada pela própria action.
 */
export function SendOrderSheet({
  supplierName,
  ...controls
}: {
  orderId: string;
  revisionId: string;
  contacts: SendContact[];
  previewMessage: string;
  evolutionReady: boolean;
  supplierName: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className={`gap-2 ${MOBILE_ACTION_CLASS}`}>
          <Send className="size-4" aria-hidden /> Enviar ao fornecedor
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Enviar a {supplierName}</DialogTitle>
          <DialogDescription>
            O link abre a confirmação do pedido, sem login. Marque como enviado
            só depois que a mensagem realmente sair.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SendOrderControls {...controls} aoEnviar={() => setOpen(false)} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O próximo passo do pedido, preso embaixo da tela do celular.
 *
 * A `main` tem 24px de respiro embaixo, e o `sticky` respeita esse espaço: o
 * `-bottom-6` cola a barra na borda (acima da barra de abas), e o `-mb-6`
 * devolve o respiro quando a página termina. Do `sm` para cima não existe — lá
 * as ações seguem no corpo da página, como sempre.
 */
export function OrderMobileActionBar({
  resumo,
  children,
}: {
  resumo: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-surface sticky -bottom-6 z-20 -mx-4 mt-2 -mb-6 flex flex-col gap-2 border-t px-4 pt-2.5 pb-3 shadow-[0_-8px_20px_-16px_rgba(0,0,0,.45)] sm:hidden">
      <p className="text-fg-muted truncate text-xs tabular-nums">{resumo}</p>
      {children}
    </div>
  );
}
