import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import {
  FilterBarSkeleton,
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { NewOrderDialog } from "@/components/orders/order-dialogs";
import { OrderFilterBar } from "@/components/orders/order-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  hasAnyOrderFilter,
  listOrderFilterSuppliers,
  parseOrderFilters,
  type OrderFilters,
} from "@/features/orders/filters";
import {
  listDirectOrderOptions,
  listOrders,
  orderNextStep,
  ORDERS_PAGE_SIZE,
  ORDER_STATUS_LABEL,
  summarizeOrders,
} from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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
 * Cabeçalho na hora; filtros e lista em fronteiras separadas.
 *
 * São duas porque têm donos diferentes: a barra de filtros depende da lista de
 * fornecedores, a tabela depende dos pedidos do recorte. Numa fronteira só, a
 * mais lenta das duas seguraria a outra na tela de espera sem precisar.
 */
export default async function PedidosPage({
  searchParams,
}: PageProps<"/pedidos">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.view")) redirect("/dashboard");

  const filters = parseOrderFilters(await searchParams);
  const podeCriar = permissions.has("order.create");

  return (
    <div className="w-full">
      <PageHeader
        title="Pedidos"
        description="Da geração ao recebimento. O pedido é enviado ao fornecedor, confirmado por ele, e só então a mercadoria pode dar entrada."
        action={
          podeCriar ? (
            // A promessa vai SEM `await`: as opções do pedido saem agora, em
            // paralelo com a lista, e o modal as desembrulha lá dentro. Esperar
            // por elas aqui seguraria o cabeçalho inteiro por uma consulta que
            // só importa depois do clique.
            <NewOrderDialog opcoes={listDirectOrderOptions(company.companyId)} />
          ) : null
        }
      />

      <Suspense fallback={<FilterBarSkeleton fields={5} />}>
        <BarraDeFiltros companyId={company.companyId} filters={filters} />
      </Suspense>

      {/* A `key` amarra a fronteira ao recorte: mudar o filtro traz o esqueleto
          de volta, em vez de deixar na tela a lista do filtro anterior. */}
      <Suspense
        key={JSON.stringify(filters)}
        fallback={
          <>
            <MetricsSkeleton />
            <TableSkeleton rows={6} columns={5} />
          </>
        }
      >
        <ListaDePedidos
          companyId={company.companyId}
          filters={filters}
          permissions={permissions}
          podeCriar={podeCriar}
        />
      </Suspense>
    </div>
  );
}

async function BarraDeFiltros({
  companyId,
  filters,
}: {
  companyId: string;
  filters: OrderFilters;
}) {
  const suppliers = await listOrderFilterSuppliers(companyId);
  return <OrderFilterBar filters={filters} suppliers={suppliers} />;
}

async function ListaDePedidos({
  companyId,
  filters,
  permissions,
  podeCriar,
}: {
  companyId: string;
  filters: OrderFilters;
  permissions: Set<string>;
  podeCriar: boolean;
}) {
  const filtrando = hasAnyOrderFilter(filters);
  const { rows: orders, truncated } = await listOrders(companyId, filters);
  const resumo = summarizeOrders(orders);

  return (
    <>
      {orders.length > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <Link href="/pedidos/novo">Criar pedido direto</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {/* No celular sobram Pedido, Situação e a ação: uma tabela de
                    sete colunas rola de lado e leva o botão para fora da tela —
                    que era justamente o problema. O que some da linha reaparece
                    embaixo do número do pedido. */}
                <TableHead>Pedido</TableHead>
                <TableHead className="hidden sm:table-cell">Fornecedor</TableHead>
                <TableHead className="hidden lg:table-cell">Entrega</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Itens
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Total
                </TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Próximo passo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const passo = orderNextStep(order.status);
                // Sem a permissão, o passo existe mas não é desta pessoa: o
                // botão vira apenas a porta de entrada do pedido.
                const podeAgir =
                  passo.permission === null || permissions.has(passo.permission);

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      {/* `prefetch={false}` nos links de linha. Com uma casca
                          de carregamento no destino, o Next passa a prefazer
                          cada rota visível — e numa lista de duzentos pedidos
                          isso são duzentas renderizações no servidor para
                          telas que ninguém abriu. O menu lateral continua
                          prefazendo: lá são seis links, e sempre os mesmos. */}
                      <Link
                        href={`/pedidos/${order.id}`} prefetch={false}
                        className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline"
                      >
                        #{order.orderNumber}
                      </Link>
                      {order.roundTitle ? (
                        <span className="text-fg-subtle block text-xs">
                          {order.roundTitle}
                        </span>
                      ) : (
                        <span className="text-fg-subtle block text-xs">
                          pedido direto
                        </span>
                      )}
                      {/* A célula é `whitespace-nowrap`; sem soltar a quebra
                          aqui, esta linha estica a coluna e empurra o botão
                          para fora da tela. */}
                      <span className="text-fg-muted block max-w-28 text-xs whitespace-normal tabular-nums sm:hidden">
                        {order.supplierName} · {MONEY.format(order.total)}
                      </span>
                    </TableCell>
                    <TableCell className="text-fg-muted hidden sm:table-cell">
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
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
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
                      <Button
                        asChild
                        size="sm"
                        variant={
                          passo.pending && podeAgir ? "default" : "outline"
                        }
                      >
                        <Link href={`/pedidos/${order.id}`} prefetch={false}>
                          <span className="hidden sm:inline">
                            {podeAgir ? passo.label : "Abrir"}
                          </span>
                          <span className="sm:hidden">
                            {podeAgir ? passo.shortLabel : "Abrir"}
                          </span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {truncated ? (
            <p className="text-fg-subtle mt-3 text-xs">
              Mostrando os {ORDERS_PAGE_SIZE} pedidos mais recentes. Use os
              filtros para chegar aos mais antigos.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
