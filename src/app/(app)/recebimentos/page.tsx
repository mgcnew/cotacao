import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { ArrivalDialog } from "@/components/receipts/arrival-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listReceivingBoard,
  listRecentPostedReceipts,
} from "@/features/receipts/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return DATE.format(new Date(year, month - 1, day));
}

export default async function RecebimentosPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const [board, history] = await Promise.all([
    listReceivingBoard(company.companyId),
    listRecentPostedReceipts(company.companyId),
  ]);
  const canRegister = permissions.has("receipt.create");
  const canPost = permissions.has("receipt.post");

  return (
    <div className="w-full">
      <PageHeader
        title="Recebimentos"
        description="Avise que a mercadoria chegou e confira quantidades e valores antes de efetivar a entrada."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric
          label="A conferir"
          value={String(board.awaitingCheck.length)}
          hint="Chegaram e ainda não deram entrada"
          tone={board.awaitingCheck.length ? "bad" : "neutral"}
        />
        <Metric
          label="Entregas previstas"
          value={String(board.expected.length)}
          hint="Pedidos confirmados ainda por chegar"
        />
        <Metric
          label="Conferidas recentemente"
          value={String(history.length)}
          hint="Últimos registros finalizados"
          tone="good"
        />
      </div>

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-fg font-semibold">Aguardando conferência</h2>
          <p className="text-fg-muted text-sm">
            Já chegaram, mas ainda não alteraram o saldo do pedido.
          </p>
        </div>
        {board.awaitingCheck.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {board.awaitingCheck.map((row) => (
              <article
                key={row.orderId}
                className="border-warning/40 bg-surface rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-fg font-semibold">
                      Pedido #{row.orderNumber} · {row.supplierName}
                    </p>
                    <p className="text-fg-muted mt-1 text-sm">
                      Chegou{" "}
                      {DATE_TIME.format(
                        new Date(
                          row.draftReceipt!.receivedAt ??
                            row.draftReceipt!.createdAt,
                        ),
                      )}
                      {row.draftReceipt!.invoiceNumber
                        ? ` · NF ${row.draftReceipt!.invoiceNumber}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="outline">A conferir</Badge>
                </div>
                <ul className="text-fg-muted mt-3 space-y-1 text-sm">
                  {row.items
                    .filter((item) => item.pendingQuantity > 0)
                    .map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>{item.productName}</span>
                        <span className="shrink-0 tabular-nums">
                          {QTY.format(item.pendingQuantity)} {item.purchaseUnit}
                        </span>
                      </li>
                    ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <span className="text-fg-muted text-sm">
                    {row.draftReceipt!.invoiceTotal !== null
                      ? `Nota: ${MONEY.format(row.draftReceipt!.invoiceTotal)}`
                      : `Pedido: ${MONEY.format(row.expectedTotal)}`}
                  </span>
                  {canPost ? (
                    <Button asChild size="sm">
                      <Link href={`/recebimentos/${row.draftReceipt!.id}`}>
                        Conferir agora
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={PackageCheck}
            title="Nenhuma chegada pendente"
            description="Quando alguém registrar a chegada, ela aparecerá aqui para conferência."
          />
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-fg font-semibold">Entregas previstas</h2>
          <p className="text-fg-muted text-sm">
            Pedidos confirmados que ainda devem chegar.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {board.expected.map((row) => (
            <article
              key={row.orderId}
              className="border-border bg-surface rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/pedidos/${row.orderId}`}
                    className="text-fg font-semibold hover:underline"
                  >
                    Pedido #{row.orderNumber} · {row.supplierName}
                  </Link>
                  <p className="text-fg-muted mt-1 text-sm">
                    {row.deliveryDueDate
                      ? `Previsto para ${formatDay(row.deliveryDueDate)}`
                      : "Sem data prevista"}{" "}
                    · {MONEY.format(row.expectedTotal)}
                  </p>
                </div>
                {canRegister ? (
                  <ArrivalDialog
                    orderId={row.orderId}
                    orderNumber={row.orderNumber}
                    supplierName={row.supplierName}
                  />
                ) : null}
              </div>
              <ul className="text-fg-muted mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {row.items
                  .filter((item) => item.pendingQuantity > 0)
                  .map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>{item.productName}</span>
                      <span className="shrink-0 tabular-nums">
                        {QTY.format(item.pendingQuantity)} {item.purchaseUnit} ·{" "}
                        {MONEY.format(item.agreedPrice)}
                      </span>
                    </li>
                  ))}
              </ul>
            </article>
          ))}
          {!board.expected.length ? (
            <p className="text-fg-muted text-sm">
              Nenhuma entrega prevista no momento.
            </p>
          ) : null}
        </div>
      </section>

      {history.length ? (
        <section>
          <h2 className="text-fg mb-3 font-semibold">
            Conferidos recentemente
          </h2>
          <div className="border-border bg-surface divide-border divide-y rounded-xl border">
            {history.map((receipt) => (
              <div
                key={receipt.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/pedidos/${receipt.orderId}`}
                    className="text-fg font-medium hover:underline"
                  >
                    Pedido #{receipt.orderNumber} · {receipt.supplierName}
                  </Link>
                  <p className="text-fg-subtle text-xs">
                    {receipt.checkedAt
                      ? DATE_TIME.format(new Date(receipt.checkedAt))
                      : DATE_TIME.format(new Date(receipt.receivedAt!))}{" "}
                    · {receipt.itemCount}{" "}
                    {receipt.itemCount === 1 ? "item" : "itens"}
                    {receipt.invoiceNumber
                      ? ` · NF ${receipt.invoiceNumber}`
                      : ""}
                  </p>
                </div>
                <span className="text-fg-muted tabular-nums">
                  {MONEY.format(
                    receipt.invoiceTotal ?? receipt.calculatedTotal,
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
