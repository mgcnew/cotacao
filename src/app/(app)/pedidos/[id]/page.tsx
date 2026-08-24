import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  CloseBalanceForm,
  ResolveDivergenceForm,
} from "@/components/orders/divergence-forms";
import {
  CancelOrderForm,
  EditDraftForm,
  NewRevisionForm,
  type EditableItem,
} from "@/components/orders/order-crud-forms";
import { SendOrderControls } from "@/components/orders/send-order-controls";
import { ArrivalDialog } from "@/components/receipts/arrival-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ORDER_DIVERGENCE_STATUS_LABEL,
  ORDER_DIVERGENCE_TYPE_LABEL,
  COMMERCIAL_DIVERGENCE_STATUS_LABEL,
} from "@/features/orders/divergences";
import { buildOrderMessage } from "@/features/orders/message";
import {
  getCurrentRevision,
  getDraftRevision,
  getOrder,
  listDirectOrderOptions,
  getOrderMessageContext,
  listOrderDivergences,
  listOrderReceipts,
  listOrderRevisions,
  listOrderSendContacts,
  listSupplierDivergences,
  ORDER_STATUS_LABEL,
  RECEIPT_STATUS_LABEL,
  REVISION_STATUS_LABEL,
  type OrderRevision,
} from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { isEvolutionConfigured } from "@/lib/evolution/client";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const DATA = new Intl.DateTimeFormat("pt-BR");

/** Data ISO do banco vira dd/mm/aaaa sem passar por fuso — é dia, não instante. */
function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DATA.format(new Date(ano, mes - 1, dia));
}

/** Situações em que o pedido já saiu daqui, mas ainda pode ser revisado. */
const REVISAVEL = [
  "awaiting_confirmation",
  "awaiting_delivery",
  "partially_received",
];

function paraEdicao(revision: OrderRevision): EditableItem[] {
  return revision.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    allocationId: item.allocationId,
    productName: item.productName,
    requestedQuantity: item.requestedQuantity,
    agreedPrice: item.agreedPrice,
    notes: item.notes,
  }));
}

export default async function PedidoPage({
  params,
}: PageProps<"/pedidos/[id]">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [order, permissions] = await Promise.all([
    getOrder(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  if (!order) notFound();
  if (!permissions.has("order.view")) redirect("/dashboard");

  const [
    revision,
    draft,
    revisions,
    receipts,
    divergences,
    supplierDivergences,
  ] = await Promise.all([
    getCurrentRevision(company.companyId, id, order.current_revision_id),
    getDraftRevision(company.companyId, id),
    listOrderRevisions(company.companyId, id),
    listOrderReceipts(company.companyId, id),
    listOrderDivergences(company.companyId, id),
    listSupplierDivergences(company.companyId, id),
  ]);

  const podeEnviar = permissions.has("order.send");
  const podeReceber = permissions.has("receipt.create");
  const podeRevisar = permissions.has("order.revise");
  const podeEditarRascunho = permissions.has("order.update_draft");
  const podeCancelar = permissions.has("order.cancel");
  const podeTratarComercial = permissions.has("commercial_divergence.manage");
  const podeEncerrarSaldo = permissions.has("receipt.post");

  const encerrado = order.status === "received" || order.status === "cancelled";
  const podeMexerNoRascunho =
    Boolean(draft) && podeEditarRascunho && !encerrado;
  // Uma revisão nova só faz sentido quando não há outra em preparação — a RPC
  // recusa a segunda, e oferecer o botão seria prometer o que ela nega.
  const podeCriarRevisao =
    podeRevisar && !draft && REVISAVEL.includes(order.status);

  // O catálogo só é carregado quando há de fato um formulário para preencher.
  const products =
    podeMexerNoRascunho || podeCriarRevisao
      ? (await listDirectOrderOptions(company.companyId)).products
      : [];

  // Contatos e mensagem só interessam quando existe rascunho para enviar. A
  // prévia vai sem link de propósito: o link ainda não foi gerado, e inventar
  // um endereço aqui seria mostrar um que não abre.
  const envio =
    podeEnviar && draft && !encerrado
      ? await (async () => {
          const [contacts, context] = await Promise.all([
            listOrderSendContacts(company.companyId, order.suppliers.id),
            getOrderMessageContext(company.companyId, id, draft.id),
          ]);
          return {
            contacts,
            previewMessage: context ? buildOrderMessage(context, null) : "",
            evolutionReady: isEvolutionConfigured(),
          };
        })()
      : null;

  const total = (revision?.items ?? []).reduce(
    (sum, i) => sum + i.requestedQuantity * i.agreedPrice,
    0,
  );
  const pendentes = (revision?.items ?? []).filter(
    (i) => i.pendingQuantity > 0,
  );
  const chegadaPendente = receipts.find(
    (receipt) => receipt.status === "draft",
  );
  const recebimentosConcluidos = receipts.filter(
    (receipt) => receipt.status !== "draft",
  );

  return (
    <div className="w-full">
      <PageHeader
        title={`Pedido #${order.order_number}`}
        description={`${order.suppliers.name}${order.purchase_rounds?.title ? ` · ${order.purchase_rounds.title}` : " · pedido direto"}`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/pedidos">Voltar</Link>
            </Button>
            <Badge
              variant={order.status === "received" ? "default" : "secondary"}
            >
              {ORDER_STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </>
        }
      />

      {revision ? (
        <section className="border-border bg-surface mb-6 rounded-xl border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-fg text-sm font-semibold">
                Revisão {revision.revisionNumber}
              </h2>
              <p className="text-fg-subtle text-xs">
                {revision.sentAt
                  ? `enviada ${DATA_HORA.format(new Date(revision.sentAt))}`
                  : "ainda não enviada"}
                {revision.confirmedAt
                  ? ` · confirmada ${DATA_HORA.format(new Date(revision.confirmedAt))}`
                  : ""}
                {revision.deliveryDueDate
                  ? ` · entrega ${formatarDia(revision.deliveryDueDate)}`
                  : ""}
              </p>
            </div>
            <span className="text-fg font-medium tabular-nums">
              {MONEY.format(total)}
            </span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {revision.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-fg">{item.productName}</span>
                <span className="text-fg-muted tabular-nums">
                  {QTY.format(item.requestedQuantity)} {item.purchaseUnit} ×{" "}
                  {MONEY.format(item.agreedPrice)}
                  {item.receivedQuantity > 0 ? (
                    <span className="text-success ml-2">
                      recebido {QTY.format(item.receivedQuantity)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="border-border bg-surface-sunken text-fg-muted mb-6 rounded-xl border px-4 py-3 text-sm">
          Este pedido não tem revisão vigente.
        </p>
      )}

      {/* Rascunho que ainda não é a revisão vigente: existe, mas não é o que o
          fornecedor tem em mãos. Sem este aviso, a tela mostraria o combinado
          antigo e esconderia o que está sendo preparado. */}
      {draft && draft.id !== order.current_revision_id ? (
        <section className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h2 className="text-fg text-sm font-semibold">
              Revisão {draft.revisionNumber} em preparação
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              Ainda não foi enviada, então o que vale para o fornecedor continua
              sendo a revisão {revision?.revisionNumber}.
              {draft.deliveryDueDate
                ? ` Entrega prevista para ${formatarDia(draft.deliveryDueDate)}.`
                : ""}
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {draft.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-fg">{item.productName}</span>
                <span className="text-fg-muted tabular-nums">
                  {QTY.format(item.requestedQuantity)} {item.purchaseUnit} ×{" "}
                  {MONEY.format(item.agreedPrice)}
                </span>
              </li>
            ))}
          </ul>
          {podeMexerNoRascunho ? (
            <EditDraftForm
              orderId={id}
              revisionId={draft.id}
              deliveryDueDate={draft.deliveryDueDate}
              items={paraEdicao(draft)}
              products={products}
            />
          ) : null}
          {podeEnviar && envio ? (
            <SendOrderControls
              orderId={id}
              revisionId={draft.id}
              contacts={envio.contacts}
              previewMessage={envio.previewMessage}
              evolutionReady={envio.evolutionReady}
            />
          ) : null}
        </section>
      ) : null}

      {draft && draft.id === order.current_revision_id ? (
        <section className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h2 className="text-fg text-sm font-semibold">
              Enviar ao fornecedor
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              O link abre a confirmação do pedido, sem login. Marque como
              enviado só depois que a mensagem realmente sair.
            </p>
          </div>
          {podeMexerNoRascunho ? (
            <EditDraftForm
              orderId={id}
              revisionId={draft.id}
              deliveryDueDate={draft.deliveryDueDate}
              items={paraEdicao(draft)}
              products={products}
            />
          ) : null}
          {podeEnviar && envio ? (
            <SendOrderControls
              orderId={id}
              revisionId={draft.id}
              contacts={envio.contacts}
              previewMessage={envio.previewMessage}
              evolutionReady={envio.evolutionReady}
            />
          ) : null}
        </section>
      ) : null}

      {order.status === "awaiting_confirmation" ? (
        <p className="border-border bg-surface-sunken text-fg-muted mb-6 rounded-xl border px-4 py-3 text-sm">
          Aguardando o fornecedor confirmar pelo link. O recebimento libera
          depois disso.
        </p>
      ) : null}

      {podeCriarRevisao && revision ? (
        <section className="mb-6">
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Mudou o combinado?
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            Pedido já enviado não se edita: cria-se uma revisão nova. A
            confirmação do fornecedor fica amarrada à revisão que ele viu.
          </p>
          <NewRevisionForm
            orderId={id}
            deliveryDueDate={revision.deliveryDueDate}
            items={paraEdicao(revision)}
            products={products}
          />
        </section>
      ) : null}

      {revision &&
      pendentes.length > 0 &&
      (order.status === "awaiting_delivery" ||
        order.status === "partially_received") ? (
        <section className="border-border bg-surface mb-6 rounded-xl border p-4">
          <h2 className="text-fg text-sm font-semibold">Recebimento</h2>
          {chegadaPendente ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-fg-muted text-sm">
                Mercadoria chegou e está aguardando a conferência de quantidades
                e valores.
              </p>
              {podeEncerrarSaldo ? (
                <Button asChild size="sm">
                  <Link href={`/recebimentos/${chegadaPendente.id}`}>
                    Abrir conferência
                  </Link>
                </Button>
              ) : (
                <Badge variant="outline">A conferir</Badge>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-fg-muted text-sm">
                Registre a chegada sem alterar o saldo. A entrada só será
                efetivada após a conferência.
              </p>
              {podeReceber ? (
                <ArrivalDialog
                  orderId={id}
                  orderNumber={order.order_number}
                  supplierName={order.suppliers.name}
                />
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {supplierDivergences.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Apontado pelo fornecedor
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            Enquanto houver divergência pendente, o pedido não avança para
            entrega.
          </p>
          <ul className="flex flex-col gap-2">
            {supplierDivergences.map((d) => (
              <li
                key={d.id}
                className="border-border bg-surface flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg font-medium">
                    {ORDER_DIVERGENCE_TYPE_LABEL[d.type] ?? d.type}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={d.status === "pending" ? "outline" : "secondary"}
                    >
                      {ORDER_DIVERGENCE_STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                    {podeRevisar && d.status === "pending" ? (
                      <ResolveDivergenceForm divergenceId={d.id} orderId={id} />
                    ) : null}
                  </span>
                </div>
                {d.notes ? <p className="text-fg-muted">{d.notes}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {divergences.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Divergências de preço
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            Detectadas sozinhas no recebimento, comparando a nota com o
            combinado.
          </p>
          <ul className="flex flex-col gap-2">
            {divergences.map((d) => (
              <li
                key={d.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <span className="text-fg">
                  {d.type === "price" ? "Preço diferente do combinado" : d.type}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {d.financial_impact !== null ? (
                    <span className="text-destructive font-medium tabular-nums">
                      {MONEY.format(Number(d.financial_impact))}
                    </span>
                  ) : null}
                  <Badge variant="outline">
                    {COMMERCIAL_DIVERGENCE_STATUS_LABEL[d.status] ?? d.status}
                  </Badge>
                  {podeTratarComercial && d.status === "pending" ? (
                    <ResolveDivergenceForm
                      divergenceId={d.id}
                      orderId={id}
                      commercial
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {podeEncerrarSaldo &&
      (order.status === "awaiting_delivery" ||
        order.status === "partially_received") ? (
        <div className="mb-6">
          <CloseBalanceForm orderId={id} />
        </div>
      ) : null}

      {recebimentosConcluidos.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-fg mb-3 text-sm font-semibold">
            Recebimentos registrados
          </h2>
          <ul className="flex flex-col gap-2">
            {recebimentosConcluidos.map((r) => (
              <li
                key={r.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <span className="text-fg-muted">
                  {r.receivedAt
                    ? DATA_HORA.format(new Date(r.receivedAt))
                    : "—"}{" "}
                  · {r.itemCount} {r.itemCount === 1 ? "item" : "itens"}
                  {r.invoiceNumber ? ` · NF ${r.invoiceNumber}` : ""}
                  {r.invoiceTotal !== null
                    ? ` · ${MONEY.format(r.invoiceTotal)}`
                    : ""}
                  {r.notes ? (
                    <span className="text-fg-subtle block text-xs">
                      {r.notes}
                    </span>
                  ) : null}
                </span>
                <Badge variant="secondary">
                  {RECEIPT_STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Só vale mostrar quando há mais de uma: com uma revisão só, o histórico
          repetiria o que está no topo da página. */}
      {revisions.length > 1 ? (
        <section className="mb-6">
          <h2 className="text-fg mb-3 text-sm font-semibold">
            Histórico de revisões
          </h2>
          <ul className="flex flex-col gap-2">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <span className="text-fg-muted">
                  <span className="text-fg font-medium">
                    Revisão {r.revisionNumber}
                  </span>{" "}
                  · {r.itemCount} {r.itemCount === 1 ? "item" : "itens"} ·{" "}
                  <span className="tabular-nums">{MONEY.format(r.total)}</span>
                  <span className="text-fg-subtle block text-xs">
                    {r.sentAt
                      ? `enviada ${DATA_HORA.format(new Date(r.sentAt))}`
                      : "nunca enviada"}
                    {r.confirmedAt
                      ? ` · confirmada ${DATA_HORA.format(new Date(r.confirmedAt))}`
                      : ""}
                    {r.deliveryDueDate
                      ? ` · entrega ${formatarDia(r.deliveryDueDate)}`
                      : ""}
                  </span>
                </span>
                <Badge
                  variant={
                    r.id === order.current_revision_id ? "default" : "outline"
                  }
                >
                  {REVISION_STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {podeCancelar && !encerrado ? <CancelOrderForm orderId={id} /> : null}
    </div>
  );
}
