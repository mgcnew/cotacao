import { ClipboardList, Plus, Scale } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
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
  ORDER_STATUS_LABEL,
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
            {permissions.has("commercial_divergence.view") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/pedidos/divergencias">
                  <Scale aria-hidden /> Divergências
                </Link>
              </Button>
            ) : null}
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
  const requestedPagination = parseListPagination(
    paginationParams,
    Number.MAX_SAFE_INTEGER,
  );
  const {
    rows: orders,
    total,
    page,
    pageSize,
    summary,
  } = await listOrders(companyId, filters, {
    page: requestedPagination.page,
    pageSize: requestedPagination.pageSize,
  });
  const presentedOrders = orders.map((order) => {
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
            value={String(summary.quantity)}
            hint={`${MONEY.format(summary.value)} fora os cancelados`}
          />
          <Metric
            label="Em rascunho"
            value={String(summary.drafts)}
            hint="ainda não saíram daqui"
          />
          <Metric
            label="A receber"
            value={String(summary.toReceive)}
            hint={`${summary.awaitingConfirmation} aguardando confirmação`}
          />
          <Metric
            label="Atrasados"
            value={String(summary.overdue)}
            hint="prazo vencido, mercadoria por vir"
            tone={summary.overdue > 0 ? "bad" : "neutral"}
          />
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            filtrando ? "Nenhum pedido neste recorte" : "Nenhum pedido ainda"
          }
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
        <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs">
          <div className="bg-surface-sunken text-fg-muted hidden grid-cols-[minmax(5rem,.7fr)_minmax(9rem,1.4fr)_7rem_4rem_7rem_minmax(8rem,1fr)_8rem] gap-3 border-b px-4 py-2 text-xs font-medium sm:grid">
            <span>Pedido</span>
            <span>Fornecedor</span>
            <span>Entrega</span>
            <span className="text-right">Itens</span>
            <span className="text-right">Total</span>
            <span>Situação</span>
            <span className="text-right">Próximo passo</span>
          </div>
          <div className="divide-border divide-y">
            {presentedOrders.map((item) => (
              <OrderResponsiveRow key={item.order.id} {...item} />
            ))}
          </div>
          <DataTablePagination page={page} pageSize={pageSize} total={total} />
        </div>
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

function OrderResponsiveRow({
  order,
  passo,
  podeAgir,
  enviarAqui,
}: PresentedOrder) {
  return (
    <article className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(5rem,.7fr)_minmax(9rem,1.4fr)_7rem_4rem_7rem_minmax(8rem,1fr)_8rem] sm:items-center sm:py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <IntentPrefetchLink
            href={`/pedidos/${order.id}`}
            className="text-fg hover:text-primary font-semibold underline-offset-4 hover:underline"
          >
            <span className="sm:hidden">Pedido </span>#{order.orderNumber}
          </IntentPrefetchLink>
          <p className="text-fg-subtle text-xs">
            {order.roundTitle ?? "Pedido direto"}
          </p>
          <p className="text-fg mt-1 wrap-anywhere text-sm font-medium sm:hidden">
            {order.supplierName}
          </p>
        </div>
        <span className="flex max-w-full flex-wrap justify-end gap-1 sm:hidden">
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
            <Badge variant="destructive">Atrasado · {order.overdueDays}d</Badge>
          ) : null}
        </span>
      </div>
      <p className="text-fg hidden wrap-anywhere text-sm font-medium sm:block">
        {order.supplierName}
      </p>
      <p
        className={
          order.isOverdue
            ? "text-destructive hidden text-xs font-medium sm:block"
            : "text-fg-muted hidden text-xs sm:block"
        }
      >
        {order.deliveryDueDate
          ? formatarDia(order.deliveryDueDate)
          : "Sem prazo"}
      </p>
      <p className="text-fg-muted hidden text-right text-sm tabular-nums sm:block">
        {order.itemCount}
      </p>
      <p className="text-fg hidden text-right text-sm font-semibold tabular-nums sm:block">
        {MONEY.format(order.total)}
      </p>
      <span className="hidden max-w-full flex-wrap gap-1 sm:flex sm:justify-start">
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
          <Badge variant="destructive">Atrasado · {order.overdueDays}d</Badge>
        ) : null}
      </span>

      <dl className="border-border grid grid-cols-3 gap-2 border-y py-3 text-center sm:hidden">
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

      <div className="[&_[data-slot=button]]:w-full sm:text-right sm:[&_[data-slot=button]]:w-auto">
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
