"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Suspense,
  use,
  useCallback,
  useRef,
  useState,
} from "react";

import { CardSkeleton } from "@/components/layout/page-skeleton";
import { SendOrderControls } from "@/components/orders/send-order-controls";
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
import {
  loadOrderSendPanel,
  type OrderSendPanel,
} from "@/features/orders/actions";

/**
 * Enviar o pedido sem sair da lista.
 *
 * POR QUE AQUI O DADO É BUSCADO AO ABRIR
 *
 * O modal de pedido novo recebe as opções prontas porque elas servem para a
 * lista inteira. Este não tem essa sorte: rascunho, contatos e mensagem são de
 * um pedido só. Adiantá-los para a lista toda seria carregar duzentos painéis
 * para abrir, no máximo, um.
 *
 * Então busca-se ao abrir — mas não no clique. A busca começa no `pointerenter`
 * e no `focus` do botão: o caminho do mouse até o botão, ou o `Tab` que chega
 * nele, costuma dar tempo suficiente para as duas idas terminarem antes do
 * clique. Quando não dá, aparece o esqueleto do painel, e não um vazio.
 *
 * O cabeçalho não espera por nada: número e fornecedor a lista já tinha em
 * mãos. O modal abre nomeando o que vai fazer, mesmo que o miolo demore.
 */
export function SendOrderDialog({
  orderId,
  orderNumber,
  supplierName,
  rotulo,
  rotuloCurto,
}: {
  orderId: string;
  orderNumber: number;
  supplierName: string;
  rotulo: string;
  rotuloCurto: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [painel, setPainel] = useState<Promise<OrderSendPanel> | null>(null);
  // A promessa vive na ref para que começar a busca seja idempotente: passar o
  // mouse três vezes pelo botão continua sendo uma ida só ao servidor.
  const iniciada = useRef<Promise<OrderSendPanel> | null>(null);

  const iniciar = useCallback(() => {
    iniciada.current ??= loadOrderSendPanel(orderId);
    setPainel(iniciada.current);
  }, [orderId]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        if (proximo) iniciar();
        setAberto(proximo);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" onPointerEnter={iniciar} onFocus={iniciar}>
          <span className="hidden sm:inline">{rotulo}</span>
          <span className="sm:hidden">{rotuloCurto}</span>
        </Button>
      </DialogTrigger>

      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Enviar pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Para {supplierName}. O link abre a confirmação do pedido sem login —
            marque como enviado só depois que a mensagem realmente sair.
          </DialogDescription>
        </DialogHeader>

        <Suspense
          fallback={
            <DialogBody>
              <CardSkeleton lines={5} />
            </DialogBody>
          }
        >
          {painel ? (
            <CorpoDoEnvio
              painel={painel}
              orderId={orderId}
              aoEnviar={() => setAberto(false)}
            />
          ) : null}
        </Suspense>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm" variant="ghost">
              Fechar
            </Button>
          </DialogClose>
          <Button asChild size="sm" variant="outline" className="ml-auto gap-1.5">
            <Link href={`/pedidos/${orderId}`} prefetch={false}>
              Abrir o pedido
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O miolo do envio, que só existe depois que o painel chega. */
function CorpoDoEnvio({
  painel,
  orderId,
  aoEnviar,
}: {
  painel: Promise<OrderSendPanel>;
  orderId: string;
  aoEnviar: () => void;
}) {
  const dados = use(painel);

  if (!dados.ok) {
    return (
      <DialogBody>
        <p className="border-border bg-surface-sunken text-fg-muted rounded-lg border px-4 py-3 text-sm">
          {dados.erro}
        </p>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      <SendOrderControls
        orderId={orderId}
        revisionId={dados.revisionId}
        contacts={dados.contacts}
        previewMessage={dados.previewMessage}
        evolutionReady={dados.evolutionReady}
        aoEnviar={aoEnviar}
      />
    </DialogBody>
  );
}
