import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { IntentPrefetchLink } from "@/components/layout/intent-prefetch-link";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import {
  FormSkeleton,
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { SendOrderDialog } from "@/components/orders/order-dialogs";
import { OrderFilterFields } from "@/components/orders/order-filter-bar";
import { AdaptivePageSize } from "@/components/ui/adaptive-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  contarOrderFilters,
  hasAnyOrderFilter,
  listOrderFilterSuppliers,
  parseOrderFilters,
  type OrderFilters,
} from "@/features/orders/filters";
import {
  listOrders,
  orderNextStep,
  ORDERS_PAGE_SIZE,
  ORDER_STATUS_LABEL,
  summarizeOrders,
} from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { parseListPagination } from "@/lib/list-pagination";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

/** Data ISO do banco vira dd/mm sem passar por fuso — é dia, não instante. */
function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DATA.format(new Date(ano, mes - 1, dia));
}

/**
 * Cabeçalho na hora; o resto em fronteiras separadas.
 *
 * São duas porque têm donos diferentes: os campos de filtro dependem da lista
 * de fornecedores, a tabela depende dos pedidos do recorte. Numa fronteira só,
 * a mais lenta das duas seguraria a outra na tela de espera sem precisar.
 *
 * Os filtros deixaram de ocupar um bloco no alto da tela e passaram a morar
 * atrás de um botão, ao lado de "Novo pedido" — mas a consulta continua saindo
 * durante a renderização da página, e não no clique.
 */
export default async function PedidosPage({
  searchParams,
}: PageProps<"/pedidos">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.view")) redirect("/dashboard");

  const params = await searchParams;
  const filters = parseOrderFilters(params);
  const podeCriar = permissions.has("order.create");

  return (
    <div className="w-full">
      <PageHeader
        title="Pedidos"
        description="Da geração ao recebimento. O pedido é enviado ao fornecedor, confirmado por ele, e só então a mercadoria pode dar entrada."
        action={
          <>
            <FilterDialog
              basePath="/pedidos"
              ativos={contarOrderFilters(filters)}
              ajuda={
                <>
                  &quot;Em aberto&quot; é tudo que ainda não foi recebido nem
                  cancelado. &quot;Atrasados&quot; é prazo vencido com
                  mercadoria por vir.
                </>
              }
            >
              {/* A fronteira fica DENTRO do modal: o botão aparece na hora, e a
                  lista de fornecedores — que é a única consulta destes campos —
                  chega junto com o resto da página, muito antes do clique. */}
              <Suspense fallback={<FormSkeleton fields={5} />}>
                <CamposDeFiltro
                  companyId={company.companyId}
                  filters={filters}
                />
              </Suspense>
            </FilterDialog>
            {podeCriar ? (
              // Link, e não botão com estado: "novo pedido" é uma rota. Vindo
              // daqui ela é interceptada e abre por cima da lista; de F5 ou do
              // painel, abre em página inteira. Um caminho só, dois embrulhos.
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/pedidos/novo">
                  <Plus className="size-3.5" aria-hidden /> Novo pedido
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* A `key` amarra a fronteira ao recorte: mudar o filtro traz o esqueleto
          de volta, em vez de deixar na tela a lista do filtro anterior. */}
      <Suspense
        key={JSON.stringify(filters)}
        fallback={
          <>
            <MetricsSkeleton className="mb-4 grid-cols-2 gap-2 sm:mb-6 sm:gap-3" />
            <TableSkeleton rows={6} columns={5} />
          </>
        }
      >
        <ListaDePedidos
          companyId={company.companyId}
          filters={filters}
          permissions={permissions}
          podeCriar={podeCriar}
          paginationParams={params}
        />
      </Suspense>
    </div>
  );
}

async function CamposDeFiltro({
  companyId,
  filters,
}: {
  companyId: string;
  filters: OrderFilters;
}) {
  const suppliers = await listOrderFilterSuppliers(companyId);
  return <OrderFilterFields filters={filters} suppliers={suppliers} />;
}

async function ListaDePedidos({
  companyId,
  filters,
  permissions,
  podeCriar,
  paginationParams,
}: {
  companyId: string;
  filters: OrderFilters;
  permissions: Set<string>;
  podeCriar: boolean;
  paginationParams: Record<string, string | string[] | undefined>;
}) {
  const filtrando = hasAnyOrderFilter(filters);
  const { rows: orders, truncated } = await listOrders(companyId, filters);
  const resumo = summarizeOrders(orders);
  const pagination = parseListPagination(paginationParams, orders.length, {
    pageSizeRange: { min: 1, max: 100, default: 10 },
  });
  const visibleOrders = orders.slice(pagination.start, pagination.end);
  const presentedOrders = visibleOrders.map((order) => {
    const passo = orderNextStep(order.status);
    // Sem a permissão, o passo existe mas não é desta pessoa: o botão vira
    // apenas a porta de entrada do pedido.
    const podeAgir =
      passo.permission === null || permissions.has(passo.permission);
    return {
      order,
      passo,
      podeAgir,
      // Rascunho com permissão de envio: o passo acontece no modal, sobre a
      // própria lista.
      enviarAqui: order.status === "draft" && podeAgir,
    };
  });

  return (
    <>
      {orders.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:grid-cols-4">
          <Metric
            label={filtrando ? "Pedidos nesta seleção" : "Pedidos"}
            value={String(resumo.quantidade)}
            hint={`${MONEY.format(resumo.valor)} fora os cancelados`}
          />
          <Metric
            label="Em rascunho"
            value={String(resumo.rascunhos)}
            hint="ainda não saíram daqui"
          />
          <Metric
            label="A receber"
            value={String(resumo.aReceber)}
            hint={`${resumo.aguardandoConfirmacao} aguardando confirmação`}
          />
          <Metric
            label="Atrasados"
            value={String(resumo.atrasados)}
            hint="prazo vencido, mercadoria por vir"
            tone={resumo.atrasados > 0 ? "bad" : "neutral"}
          />
        </div>
      ) : null}

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtrando ? "Nenhum pedido neste recorte" : "Nenhum pedido ainda"}
          description={
            filtrando
              ? "Nenhum pedido casa com o filtro aplicado. Limpe o recorte para ver todos."
              : "Pedidos nascem da decisão de compra de uma rodada, na tela de alocação — ou direto aqui, quando a compra foi fechada por fora da cotação."
          }
          action={
            filtrando ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/pedidos">Limpar filtros</Link>
              </Button>
            ) : podeCriar ? (
              <Button asChild size="sm">
                <Link href="/pedidos/novo">Criar pedido</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="sm:hidden">
            <AdaptivePageSize current={pagination.pageSize} minRows={1} />
            <div className="flex flex-col gap-3">
              {presentedOrders.map((item) => (
                <OrderMobileCard key={item.order.id} {...item} />
              ))}
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={orders.length}
                allowPageSize={false}
              />
              {truncated ? <TruncatedOrdersNotice /> : null}
            </div>
          </div>

          <div className="hidden sm:contents">
            <AdaptivePageSize current={pagination.pageSize} />
            <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                    <TableHead>Pedido</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Entrega
                    </TableHead>
                    <TableHead className="hidden text-right lg:table-cell">
                      Itens
                    </TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">
                      Próximo passo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {presentedOrders.map(
                    ({ order, passo, podeAgir, enviarAqui }) => (
                      <TableRow key={order.id}>
                    <TableCell>
                      <IntentPrefetchLink
                        href={`/pedidos/${order.id}`}
                        className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline"
                      >
                        #{order.orderNumber}
                      </IntentPrefetchLink>
                      {order.roundTitle ? (
                        <span className="text-fg-subtle block text-xs">
                          {order.roundTitle}
                        </span>
                      ) : (
                        <span className="text-fg-subtle block text-xs">
                          pedido direto
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-fg-muted">
                      {order.supplierName}
                    </TableCell>
                    <TableCell className="hidden text-xs lg:table-cell">
                      {order.deliveryDueDate ? (
                        <span
                          className={
                            order.isOverdue
                              ? "text-destructive font-medium"
                              : "text-fg-muted"
                          }
                        >
                          {formatarDia(order.deliveryDueDate)}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-fg-muted hidden text-right tabular-nums lg:table-cell">
                      {order.itemCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MONEY.format(order.total)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant={
                            order.status === "received"
                              ? "default"
                              : passo.pending
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                        {order.isOverdue ? (
                          <Badge variant="destructive">
                            Atrasado · {order.overdueDays}d
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Enviar é o único passo que cabe inteiro aqui: são
                          alguns botões e uma mensagem para conferir, sem
                          formulário longo. Dar entrada mexe em quantidade por
                          item e depende do que já foi recebido — esse continua
                          sendo assunto da tela do pedido. */}
                      {enviarAqui ? (
                        <SendOrderDialog
                          orderId={order.id}
                          orderNumber={order.orderNumber}
                          supplierName={order.supplierName}
                          rotulo={passo.label}
                          rotuloCurto={passo.shortLabel}
                        />
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          variant={
                            passo.pending && podeAgir ? "default" : "outline"
                          }
                        >
                          <IntentPrefetchLink href={`/pedidos/${order.id}`}>
                            {podeAgir ? passo.label : "Abrir"}
                          </IntentPrefetchLink>
                        </Button>
                      )}
                    </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>

              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={orders.length}
                allowPageSize={false}
              />

              {truncated ? <TruncatedOrdersNotice /> : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}

type PresentedOrder = {
  order: Awaited<ReturnType<typeof listOrders>>["rows"][number];
  passo: ReturnType<typeof orderNextStep>;
  podeAgir: boolean;
  enviarAqui: boolean;
};

function OrderMobileCard({
  order,
  passo,
  podeAgir,
  enviarAqui,
}: PresentedOrder) {
  return (
    <article
      data-slot="adaptive-row"
      className="border-border bg-surface min-w-0 rounded-xl border p-4 shadow-xs"
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <IntentPrefetchLink
            href={`/pedidos/${order.id}`}
            className="text-fg hover:text-primary font-semibold underline-offset-4 hover:underline"
          >
            Pedido #{order.orderNumber}
          </IntentPrefetchLink>
          <p className="text-fg mt-1 wrap-anywhere text-sm font-medium">
            {order.supplierName}
          </p>
          <p className="text-fg-subtle text-xs">
            {order.roundTitle ?? "Pedido direto"}
          </p>
        </div>
        <span className="flex max-w-full flex-wrap justify-end gap-1">
          <Badge
            variant={
              order.status === "received"
                ? "default"
                : passo.pending
                  ? "outline"
                  : "secondary"
            }
          >
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </Badge>
          {order.isOverdue ? (
            <Badge variant="destructive">
              Atrasado · {order.overdueDays}d
            </Badge>
          ) : null}
        </span>
      </header>

      <dl className="border-border mt-3 grid grid-cols-3 gap-2 border-y py-3 text-center">
        <div className="min-w-0">
          <dt className="text-fg-subtle text-[11px]">Total</dt>
          <dd className="text-fg mt-0.5 truncate text-xs font-semibold tabular-nums">
            {MONEY.format(order.total)}
          </dd>
        </div>
        <div className="border-border min-w-0 border-x px-1">
          <dt className="text-fg-subtle text-[11px]">Itens</dt>
          <dd className="text-fg mt-0.5 text-sm font-semibold tabular-nums">
            {order.itemCount}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-subtle text-[11px]">Entrega</dt>
          <dd
            className={
              order.isOverdue
                ? "text-destructive mt-0.5 text-xs font-semibold tabular-nums"
                : "text-fg mt-0.5 text-xs font-semibold tabular-nums"
            }
          >
            {order.deliveryDueDate
              ? formatarDia(order.deliveryDueDate)
              : "Sem prazo"}
          </dd>
        </div>
      </dl>

      <div className="mt-3 [&_[data-slot=button]]:w-full">
        {enviarAqui ? (
          <SendOrderDialog
            orderId={order.id}
            orderNumber={order.orderNumber}
            supplierName={order.supplierName}
            rotulo={passo.label}
            rotuloCurto={passo.shortLabel}
          />
        ) : (
          <Button
            asChild
            size="sm"
            className="w-full"
            variant={passo.pending && podeAgir ? "default" : "outline"}
          >
            <IntentPrefetchLink href={`/pedidos/${order.id}`}>
              {podeAgir ? passo.label : "Abrir pedido"}
            </IntentPrefetchLink>
          </Button>
        )}
      </div>
    </article>
  );
}

function TruncatedOrdersNotice() {
  return (
    <p
      data-slot="table-extra-footer"
      className="text-fg-subtle border-border border-t px-3 py-2 text-xs"
    >
      Mostrando os {ORDERS_PAGE_SIZE} pedidos mais recentes. Use os filtros
      para chegar aos mais antigos.
    </p>
  );
}
