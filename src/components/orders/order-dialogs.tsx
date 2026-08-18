"use client";

import { ArrowRight, PackagePlus, Plus } from "lucide-react";
import Link from "next/link";
import {
  Suspense,
  use,
  useActionState,
  useCallback,
  useRef,
  useState,
} from "react";

import { useFechaAoSalvar } from "@/components/layout/fecha-ao-salvar";
import { ErrorLine } from "@/components/layout/form-feedback";
import { CardSkeleton, FormSkeleton } from "@/components/layout/page-skeleton";
import {
  CamposDoPedidoDireto,
  type DirectOrderOptions,
} from "@/components/orders/direct-order-form";
import { Submit } from "@/components/orders/order-item-rows";
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
  useFormularioSujo,
} from "@/components/ui/dialog";
import {
  createDirectOrder,
  loadOrderSendPanel,
  type OrderActionState,
  type OrderSendPanel,
} from "@/features/orders/actions";

/**
 * Pedido direto sem sair da lista.
 *
 * COMO ELE ABRE INSTANTÂNEO MESMO PRECISANDO DE DADO
 *
 * Diferente da nova rodada, este formulário precisa de fornecedores e produtos
 * — duas consultas, ~250 ms. Buscá-las ao abrir faria o modal piscar vazio, que
 * é a mesma espera da navegação com outra roupa.
 *
 * Então a página NÃO espera por elas: ela passa a *promessa* para cá, sem
 * `await`. As consultas saem junto com a lista de pedidos, em paralelo, e ficam
 * prontas enquanto a pessoa lê a tela. O `use()` desembrulha a promessa dentro
 * de uma fronteira de `Suspense`, então:
 *
 *  - o botão existe desde o primeiro instante — ele não depende de dado;
 *  - clicar abre o modal na hora;
 *  - no caso raro de a pessoa clicar antes de as opções chegarem, ela vê o
 *    esqueleto do formulário por uma fração de segundo em vez de um vazio.
 *
 * Passar promessa do servidor para o cliente é o que o React 19 permite
 * justamente para isto: começar a busca cedo sem bloquear a renderização.
 */
export function NewOrderDialog({
  opcoes,
}: {
  /** Sem `await` de propósito — quem espera é o `use()`, lá dentro. */
  opcoes: Promise<DirectOrderOptions>;
}) {
  const [state, formAction] = useActionState<OrderActionState, FormData>(
    createDirectOrder,
    { error: null },
  );
  const [aberto, setAberto] = useFechaAoSalvar(state.savedAt);
  const { sujo, marcarSujo, limpar } = useFormularioSujo();

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        if (!proximo) limpar();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" aria-hidden /> Novo pedido
        </Button>
      </DialogTrigger>

      <DialogContent size="md" impedirFechamentoAcidental={sujo}>
        <DialogHeader>
          <DialogTitle>Novo pedido</DialogTitle>
          <DialogDescription>
            Compra fechada por fora da cotação — por telefone, no balcão, ou a
            reposição de sempre. Daqui ele segue o mesmo caminho: enviar,
            confirmar, receber.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} onChange={marcarSujo} className="contents">
          <Suspense
            fallback={
              <DialogBody>
                <FormSkeleton fields={3} />
              </DialogBody>
            }
          >
            <CorpoDoPedido opcoes={opcoes} erro={state.error} />
          </Suspense>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O miolo, que só existe depois que as opções chegam.
 *
 * Corpo e rodapé juntos porque o rodapé depende do mesmo dado: sem fornecedor
 * ou sem produto cadastrado não há o que submeter, e um botão "Criar pedido"
 * ali seria um convite para um erro.
 */
function CorpoDoPedido({
  opcoes,
  erro,
}: {
  opcoes: Promise<DirectOrderOptions>;
  erro: string | null;
}) {
  const { suppliers, products } = use(opcoes);

  if (suppliers.length === 0 || products.length === 0) {
    const faltaFornecedor = suppliers.length === 0;
    return (
      <DialogBody>
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
      </DialogBody>
    );
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <CamposDoPedidoDireto
          suppliers={suppliers}
          products={products}
          idPrefixo="modal-"
        />
        <ErrorLine error={erro} />
      </DialogBody>

      <DialogFooter>
        <Submit label="Criar pedido" busy="Criando…" />
        <DialogClose asChild>
          <Button type="button" size="sm" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <p className="text-fg-subtle ml-auto text-xs">
          Nasce em rascunho — nada vai ao fornecedor ainda.
        </p>
      </DialogFooter>
    </>
  );
}

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
