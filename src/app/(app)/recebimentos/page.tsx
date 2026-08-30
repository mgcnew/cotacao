import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { ArrivalDialog } from "@/components/receipts/arrival-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCompany } from "@/features/company/queries";
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
function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return DATE.format(new Date(year, month - 1, day));
}

export default async function RecebimentosPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const [board, history, companyDetails] = await Promise.all([
    listReceivingBoard(company.companyId),
    listRecentPostedReceipts(company.companyId),
    getCompany(company.companyId),
  ]);
  const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: companyDetails.timezone,
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: companyDetails.timezone,
  }).format(new Date());
  const expected = [...board.expected].sort((a, b) => {
    if (!a.deliveryDueDate) return b.deliveryDueDate ? 1 : 0;
    if (!b.deliveryDueDate) return -1;
    return a.deliveryDueDate.localeCompare(b.deliveryDueDate);
  });
  const canRegister = permissions.has("receipt.create");
  const canPost = permissions.has("receipt.post");

  return (
    <div className="w-full">
      <PageHeader
        title="Recebimentos"
        description={
          <>
            <span className="sm:hidden">
              Consulte as entregas previstas e registre a chegada da mercadoria.
            </span>
            <span className="hidden sm:inline">
              Avise que a mercadoria chegou e confira quantidades e valores
              antes de efetivar a entrada.
            </span>
          </>
        }
        action={
          canPost ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/recebimentos/historico">Importar histórico XML</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 hidden gap-3 sm:grid sm:grid-cols-3">
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

      <section className="mb-8 hidden sm:block">
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
                      {dateTimeFormatter.format(
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
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-fg font-semibold">Entregas previstas</h2>
            <p className="text-fg-muted text-sm">
              Pedidos confirmados que ainda devem chegar.
            </p>
          </div>
          <Badge variant="outline" className="sm:hidden">
            {expected.length}
          </Badge>
        </div>
        <div className="flex flex-col gap-3">
          {expected.map((row) => {
            const pendingItems = row.items.filter(
              (item) => item.pendingQuantity > 0,
            );
            const deliveryLabel = !row.deliveryDueDate
              ? "Sem data prevista"
              : row.deliveryDueDate < today
                ? `Atrasada · ${formatDay(row.deliveryDueDate)}`
                : row.deliveryDueDate === today
                  ? "Chega hoje"
                  : `Prevista · ${formatDay(row.deliveryDueDate)}`;
            const deliveryTone =
              row.deliveryDueDate && row.deliveryDueDate < today
                ? "destructive"
                : row.deliveryDueDate === today
                  ? "secondary"
                  : "outline";
            return (
              <article
                key={row.orderId}
                className="border-border bg-surface rounded-xl border p-3 sm:p-4"
              >
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/pedidos/${row.orderId}`}
                      className="text-fg block truncate font-semibold hover:underline"
                    >
                      Pedido #{row.orderNumber} · {row.supplierName}
                    </Link>
                    <div className="mt-1 sm:hidden">
                      <Badge variant={deliveryTone}>{deliveryLabel}</Badge>
                      <p className="text-fg-muted mt-1.5 text-xs">
                        {pendingItems.length}{" "}
                        {pendingItems.length === 1 ? "produto" : "produtos"}
                      </p>
                    </div>
                    <p className="text-fg-muted mt-1 hidden text-sm sm:block">
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
                <details className="border-border mt-3 rounded-lg border sm:hidden">
                  <summary className="text-fg-muted cursor-pointer px-3 py-2 text-xs font-medium">
                    Ver {pendingItems.length}{" "}
                    {pendingItems.length === 1 ? "produto" : "produtos"}
                  </summary>
                  <ul className="border-border text-fg-muted space-y-1 border-t px-3 py-2 text-xs">
                    {pendingItems.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span className="min-w-0 wrap-anywhere">
                          {item.productName}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {QTY.format(item.pendingQuantity)} {item.purchaseUnit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
                <ul className="text-fg-muted mt-3 hidden gap-x-6 gap-y-1 text-sm sm:grid sm:grid-cols-2">
                  {pendingItems.map((item) => (
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
            );
          })}
          {!expected.length ? (
            <p className="text-fg-muted text-sm">
              Nenhuma entrega prevista no momento.
            </p>
          ) : null}
        </div>
      </section>

      {history.length ? (
        <section className="hidden sm:block">
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
                      ? dateTimeFormatter.format(new Date(receipt.checkedAt))
                      : dateTimeFormatter.format(
                          new Date(receipt.receivedAt!),
                        )}{" "}
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
