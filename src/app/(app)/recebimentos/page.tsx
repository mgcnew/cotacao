import { BadgeDollarSign, ChevronDown, PackageCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { ArrivalDialog } from "@/components/receipts/arrival-dialog";
import { ConfirmPricesForm } from "@/components/receipts/confirm-prices-form";
import { QuickReceiveDialog } from "@/components/receipts/quick-receive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { listPendingPriceConfirmations } from "@/features/receipts/pending-prices";
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

export default async function RecebimentosPage({
  searchParams,
}: PageProps<"/recebimentos">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const params = await searchParams;
  const rawPage = Number(
    Array.isArray(params.pagina) ? params.pagina[0] : params.pagina,
  );
  const [board, history, pendingPrices] = await Promise.all([
    listReceivingBoard(company.companyId),
    listRecentPostedReceipts(
      company.companyId,
      Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    ),
    listPendingPriceConfirmations(company.companyId),
  ]);
  const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: company.companyTimezone,
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.companyTimezone,
  }).format(new Date());
  const expected = [...board.expected].sort((a, b) => {
    if (!a.deliveryDueDate) return b.deliveryDueDate ? 1 : 0;
    if (!b.deliveryDueDate) return -1;
    return a.deliveryDueDate.localeCompare(b.deliveryDueDate);
  });
  const isLate = (row: (typeof expected)[number]) =>
    Boolean(row.deliveryDueDate && row.deliveryDueDate < today);
  const lateOnes = expected.filter(isLate);
  const dueToday = expected.filter((row) => row.deliveryDueDate === today);
  const upcoming = expected.filter(
    (row) => !row.deliveryDueDate || row.deliveryDueDate > today,
  );
  const rawFilter = Array.isArray(params.filtro)
    ? params.filtro[0]
    : params.filtro;
  const filter =
    rawFilter === "atrasadas" ||
    rawFilter === "hoje" ||
    rawFilter === "proximas"
      ? rawFilter
      : "todas";
  const shown =
    filter === "atrasadas"
      ? lateOnes
      : filter === "hoje"
        ? dueToday
        : filter === "proximas"
          ? upcoming
          : expected;
  const groupBySupplier = params.agrupar === "fornecedor";
  const oldestLateDays = lateOnes[0]?.deliveryDueDate
    ? Math.round(
        (Date.parse(today) - Date.parse(lateOnes[0].deliveryDueDate)) /
          86_400_000,
      )
    : 0;
  const filterHref = (next: string, group = groupBySupplier) => {
    const query = new URLSearchParams();
    if (next !== "todas") query.set("filtro", next);
    if (group) query.set("agrupar", "fornecedor");
    const text = query.toString();
    return `/recebimentos${text ? `?${text}` : ""}`;
  };
  const supplierGroups = (() => {
    const groups = new Map<string, typeof shown>();
    for (const row of shown) {
      groups.set(row.supplierName, [
        ...(groups.get(row.supplierName) ?? []),
        row,
      ]);
    }
    return [...groups.entries()];
  })();
  const canRegister = permissions.has("receipt.create");
  const canPost = permissions.has("receipt.post");

  function renderExpected(row: (typeof expected)[number]) {
    const pendingItems = row.items.filter((item) => item.pendingQuantity > 0);
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
            <p className="text-fg-muted mt-1 hidden items-center gap-2 text-sm sm:flex">
              {row.deliveryDueDate
                ? `Previsto para ${formatDay(row.deliveryDueDate)}`
                : "Sem data prevista"}
              {row.deliveryDueDate && row.deliveryDueDate <= today ? (
                <Badge variant={deliveryTone}>
                  {row.deliveryDueDate === today
                    ? "Chega hoje"
                    : `Atrasada ${Math.round((Date.parse(today) - Date.parse(row.deliveryDueDate)) / 86_400_000)} d`}
                </Badge>
              ) : null}
            </p>
          </div>
          {canRegister ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {canPost && row.canReceiveAsOrdered ? (
                <QuickReceiveDialog
                  orderId={row.orderId}
                  orderNumber={row.orderNumber}
                  supplierName={row.supplierName}
                  defaultDay={
                    row.deliveryDueDate && row.deliveryDueDate <= today
                      ? row.deliveryDueDate
                      : today
                  }
                  maxDay={today}
                  items={pendingItems.map((item) => ({
                    id: item.id,
                    name: item.productName,
                    quantity: item.pendingQuantity,
                    unit: item.purchaseUnit,
                  }))}
                />
              ) : null}
              <ArrivalDialog
                orderId={row.orderId}
                orderNumber={row.orderNumber}
                supplierName={row.supplierName}
              />
            </div>
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
  }

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

      <div className="mb-6 hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5">
        <Metric
          label="Atrasadas"
          value={String(lateOnes.length)}
          hint="Entrega prevista já passou"
          tone={lateOnes.length ? "bad" : "neutral"}
        />
        <Metric
          label="A conferir"
          value={String(board.awaitingCheck.length)}
          hint="Chegaram e ainda não deram entrada"
          tone={board.awaitingCheck.length ? "bad" : "neutral"}
        />
        <Metric
          label="Preços a confirmar"
          value={String(pendingPrices.length)}
          hint="Baixa feita sem a nota"
          tone={pendingPrices.length ? "bad" : "neutral"}
        />
        <Metric
          label="Entregas previstas"
          value={String(board.expected.length)}
          hint="Pedidos confirmados ainda por chegar"
        />
        <Metric
          label="Conferidas"
          value={String(history.pagination.total)}
          hint="Entradas já efetivadas"
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
          // `items-start`: abrir os produtos de um cartão não estica o vizinho.
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {board.awaitingCheck.map((row) => {
              const pendingItems = row.items.filter(
                (item) => item.pendingQuantity > 0,
              );
              const arrival = dateTimeFormatter.format(
                new Date(
                  row.draftReceipt!.receivedAt ?? row.draftReceipt!.createdAt,
                ),
              );
              return (
                <article
                  key={row.orderId}
                  className="border-warning/40 bg-surface rounded-xl border p-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-fg truncate font-semibold">
                        Pedido #{row.orderNumber} · {row.supplierName}
                      </p>
                      <p className="text-fg-muted mt-0.5 text-[13px]">
                        Chegou {arrival}
                        {row.draftReceipt!.invoiceNumber
                          ? ` · NF ${row.draftReceipt!.invoiceNumber}`
                          : ""}
                        {row.draftReceipt!.invoiceTotal !== null
                          ? ` · ${MONEY.format(row.draftReceipt!.invoiceTotal)}`
                          : ""}
                      </p>
                    </div>
                    {canPost ? (
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={`/recebimentos/${row.draftReceipt!.id}`}>
                          Conferir agora
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  {/* Os produtos só abrem sob demanda: com vários pedidos
                      esperando, a lista aberta de cada um vira uma parede. */}
                  {pendingItems.length ? (
                    <details className="group mt-2">
                      <summary className="text-fg-muted hover:text-fg inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                          className="size-3.5 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                        Ver {pendingItems.length}{" "}
                        {pendingItems.length === 1 ? "produto" : "produtos"}
                      </summary>
                      <ul className="text-fg-muted border-border mt-2 space-y-1 border-t pt-2 text-sm">
                        {pendingItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex justify-between gap-3"
                          >
                            <span className="min-w-0 wrap-anywhere">
                              {item.productName}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {QTY.format(item.pendingQuantity)}{" "}
                              {item.purchaseUnit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={PackageCheck}
            title="Nenhuma chegada pendente"
            description="Quando alguém registrar a chegada, ela aparecerá aqui para conferência."
          />
        )}
      </section>

      {pendingPrices.length ? (
        <section id="confirmar-precos" className="mb-8 scroll-mt-20">
          <div className="mb-3 flex items-start gap-3">
            <span className="bg-surface-sunken border-border rounded-lg border p-2">
              <BadgeDollarSign className="text-fg-muted size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-fg font-semibold">Preços a confirmar</h2>
              <p className="text-fg-muted text-sm">
                Pedidos que já deram baixa sem nota. Até confirmar, o preço vale
                o combinado e não aparece como divergência.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {pendingPrices.map((receipt) => (
              <details
                key={receipt.receiptId}
                className="group border-border bg-surface rounded-xl border"
                open={pendingPrices.length === 1}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <p className="text-fg font-semibold">
                      Pedido #{receipt.orderNumber} · {receipt.supplierName}
                    </p>
                    <p className="text-fg-subtle text-xs">
                      {receipt.receivedAt || receipt.checkedAt
                        ? `Baixa em ${DATE.format(new Date((receipt.receivedAt ?? receipt.checkedAt)!))} · `
                        : ""}
                      {receipt.items.length}{" "}
                      {receipt.items.length === 1 ? "produto" : "produtos"} sem
                      preço confirmado
                    </p>
                  </div>
                  <Badge variant="outline">
                    {receipt.invoices.length
                      ? `${receipt.invoices.length} NF-e para usar`
                      : "A confirmar"}
                  </Badge>
                </summary>
                <div className="border-border border-t p-4">
                  <ConfirmPricesForm receipt={receipt} canConfirm={canPost} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-fg font-semibold">Entregas previstas</h2>
            <p className="text-fg-muted text-sm">
              {lateOnes.length
                ? `${lateOnes.length} ${lateOnes.length === 1 ? "atrasada" : "atrasadas"}, a mais antiga há ${oldestLateDays} ${oldestLateDays === 1 ? "dia" : "dias"}. Pedidos confirmados que ainda devem chegar.`
                : "Pedidos confirmados que ainda devem chegar."}
            </p>
          </div>
          <Badge variant="outline" className="sm:hidden">
            {expected.length}
          </Badge>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            href={filterHref("todas")}
            aria-current={filter === "todas" ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "todas" ? "border-primary-solid bg-primary-solid text-primary-solid-fg" : "border-border text-fg-muted hover:text-fg"}`}
          >
            Todas ({expected.length})
          </Link>
          <Link
            href={filterHref("atrasadas")}
            aria-current={filter === "atrasadas" ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "atrasadas" ? "border-primary-solid bg-primary-solid text-primary-solid-fg" : "border-border text-fg-muted hover:text-fg"}`}
          >
            Atrasadas ({lateOnes.length})
          </Link>
          <Link
            href={filterHref("hoje")}
            aria-current={filter === "hoje" ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "hoje" ? "border-primary-solid bg-primary-solid text-primary-solid-fg" : "border-border text-fg-muted hover:text-fg"}`}
          >
            Hoje ({dueToday.length})
          </Link>
          <Link
            href={filterHref("proximas")}
            aria-current={filter === "proximas" ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "proximas" ? "border-primary-solid bg-primary-solid text-primary-solid-fg" : "border-border text-fg-muted hover:text-fg"}`}
          >
            Próximas ({upcoming.length})
          </Link>
          <Link
            href={filterHref(filter, !groupBySupplier)}
            className="text-primary ml-auto text-xs font-medium underline underline-offset-2"
          >
            {groupBySupplier ? "Ver em lista" : "Agrupar por fornecedor"}
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {groupBySupplier
            ? supplierGroups.map(([supplier, rows]) => (
                <div key={supplier} className="flex flex-col gap-2">
                  <h3 className="text-fg-muted mt-2 text-sm font-semibold">
                    {supplier}{" "}
                    <span className="text-fg-subtle font-normal">
                      · {rows.length} {rows.length === 1 ? "pedido" : "pedidos"}
                    </span>
                  </h3>
                  {rows.map(renderExpected)}
                </div>
              ))
            : shown.map(renderExpected)}
          {!shown.length ? (
            <p className="text-fg-muted text-sm">
              {expected.length
                ? "Nenhuma entrega neste filtro."
                : "Nenhuma entrega prevista no momento."}
            </p>
          ) : null}
        </div>
      </section>

      {history.rows.length ? (
        <section className="hidden sm:block">
          <h2 className="text-fg mb-3 font-semibold">
            Conferidos recentemente
          </h2>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            <div className="divide-border divide-y">
              {history.rows.map((receipt) => (
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
            <DataTablePagination
              {...history.pagination}
              allowPageSize={false}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
