import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  CloseBalanceForm,
  ResolveDivergenceForm,
} from "@/components/orders/divergence-forms";
import {
  OrderLinkControls,
  ReceiptForm,
} from "@/components/orders/order-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markOrderSent } from "@/features/orders/actions";
import {
  ORDER_DIVERGENCE_STATUS_LABEL,
  ORDER_DIVERGENCE_TYPE_LABEL,
  COMMERCIAL_DIVERGENCE_STATUS_LABEL,
} from "@/features/orders/divergences";
import {
  getCurrentRevision,
  getOrder,
  listOrderDivergences,
  listOrderReceipts,
  listSupplierDivergences,
  ORDER_STATUS_LABEL,
} from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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

  const [revision, receipts, divergences, supplierDivergences] =
    await Promise.all([
      getCurrentRevision(company.companyId, id, order.current_revision_id),
      listOrderReceipts(company.companyId, id),
      listOrderDivergences(company.companyId, id),
      listSupplierDivergences(company.companyId, id),
    ]);

  const podeEnviar = permissions.has("order.send");
  const podeReceber = permissions.has("receipt.create");
  const podeRevisar = permissions.has("order.revise");
  const podeTratarComercial = permissions.has("commercial_divergence.manage");
  const podeEncerrarSaldo = permissions.has("receipt.post");

  const total = (revision?.items ?? []).reduce(
    (sum, i) => sum + i.requestedQuantity * i.agreedPrice,
    0,
  );
  const pendentes = (revision?.items ?? []).filter(
    (i) => i.pendingQuantity > 0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={`Pedido #${order.order_number}`}
        description={`${order.suppliers.name}${order.purchase_rounds?.title ? ` · ${order.purchase_rounds.title}` : ""}`}
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
                  ? ` · entrega ${revision.deliveryDueDate}`
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

      {podeEnviar && revision && order.status === "draft" ? (
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
          <OrderLinkControls orderId={id} revisionId={revision.id} />
          <form action={markOrderSent.bind(null, id, revision.id)}>
            <Button type="submit" size="sm" variant="outline">
              Marquei como enviado
            </Button>
          </form>
        </section>
      ) : null}

      {order.status === "awaiting_confirmation" ? (
        <p className="border-border bg-surface-sunken text-fg-muted mb-6 rounded-xl border px-4 py-3 text-sm">
          Aguardando o fornecedor confirmar pelo link. O recebimento libera
          depois disso.
        </p>
      ) : null}

      {podeReceber &&
      revision &&
      pendentes.length > 0 &&
      (order.status === "awaiting_delivery" ||
        order.status === "partially_received") ? (
        <section className="mb-6">
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Dar entrada na mercadoria
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            Quantidade recebida é o que entrou fisicamente; a de precificação é
            a base do dinheiro. Os dois números existem porque nem sempre
            coincidem.
          </p>
          <ReceiptForm orderId={id} items={pendentes} />
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
                {d.notes ? (
                  <p className="text-fg-muted">{d.notes}</p>
                ) : null}
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

      {receipts.length > 0 ? (
        <section>
          <h2 className="text-fg mb-3 text-sm font-semibold">
            Recebimentos registrados
          </h2>
          <ul className="flex flex-col gap-2">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <span className="text-fg-muted">
                  {r.receivedAt
                    ? DATA_HORA.format(new Date(r.receivedAt))
                    : "—"}{" "}
                  · {r.itemCount} {r.itemCount === 1 ? "item" : "itens"}
                  {r.notes ? (
                    <span className="text-fg-subtle block text-xs">
                      {r.notes}
                    </span>
                  ) : null}
                </span>
                <Badge variant="secondary">{r.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
