import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import {
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { NewRoundDialog } from "@/components/rounds/round-dialogs";
import { RoundFilterFields } from "@/components/rounds/round-filter-bar";
import { RoundMobileCard, RoundRow } from "@/components/rounds/round-row";
import { AdaptivePageSize } from "@/components/ui/adaptive-page-size";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  contarRoundFilters,
  hasAnyRoundFilter,
  parseRoundFilters,
  type RoundFilters,
} from "@/features/rounds/filters";
import {
  listRoundsWithProgress,
  summarizeRounds,
} from "@/features/rounds/queries";
import { roundNextStep } from "@/features/rounds/status";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { parseListPagination } from "@/lib/list-pagination";

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/**
 * A tela em si só decide o que pode ser mostrado — decisão barata, uma ida ao
 * banco — e entrega o cabeçalho na hora. A lista, que é a parte
 * cara, chega depois pelo `Suspense` abaixo.
 *
 * A ordem em que a tela aparece passa a ser a ordem em que ela é útil: os
 * botões de "Filtros" e "Nova rodada" já respondem enquanto as rodadas vêm.
 */
export default async function ComprasPage({
  searchParams,
}: PageProps<"/compras">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("purchase_round.view")) redirect("/dashboard");

  const params = await searchParams;
  const filters = parseRoundFilters(params);
  const podeCriar = permissions.has("purchase_round.create");

  return (
    <div className="w-full">
      <PageHeader
        title="Compras"
        description="Cada rodada reúne produtos, convida fornecedores, recebe preços e vira pedido."
        action={
          <>
            <FilterDialog
              basePath="/compras"
              ativos={contarRoundFilters(filters)}
              ajuda={
                <>
                  &quot;Em aberto&quot; é preparação e andamento juntos.
                  &quot;Aguardando resposta&quot; é rodada ativa com fornecedor
                  devendo preço.
                </>
              }
            >
              <RoundFilterFields filters={filters} />
            </FilterDialog>
            {podeCriar ? <NewRoundDialog /> : null}
          </>
        }
      />

      {/* A `key` amarra a fronteira ao recorte: mudar o filtro traz o esqueleto
          de volta, em vez de deixar na tela a lista do filtro anterior como se
          ainda valesse. */}
      <Suspense
        key={JSON.stringify(filters)}
        fallback={
          <>
            <MetricsSkeleton />
            <TableSkeleton rows={6} columns={5} />
          </>
        }
      >
        <ListaDeRodadas
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

async function ListaDeRodadas({
  companyId,
  filters,
  permissions,
  podeCriar,
  paginationParams,
}: {
  companyId: string;
  filters: RoundFilters;
  permissions: Set<string>;
  podeCriar: boolean;
  paginationParams: Record<string, string | string[] | undefined>;
}) {
  const filtrando = hasAnyRoundFilter(filters);
  const podeEditarRodada = permissions.has("purchase_round.update");
  const rounds = await listRoundsWithProgress(companyId, filters);
  const resumo = summarizeRounds(rounds);
  const pagination = parseListPagination(paginationParams, rounds.length, {
    pageSizeRange: { min: 1, max: 100, default: 10 },
  });
  const visibleRounds = rounds.slice(pagination.start, pagination.end);
  const presentedRounds = visibleRounds.map((round) => {
    const id = round.purchase_round_id ?? "";
    const status = round.status ?? "";
    const passo = roundNextStep(status, {
      suppliersPending: Number(round.suppliers_pending ?? 0),
      ordersCreated: Number(round.orders_created ?? 0),
    });
    return {
      round: {
        id,
        title: round.title ?? "",
        notes: round.notes,
        criadaEm: round.created_at
          ? DATA.format(new Date(round.created_at))
          : "—",
        totalItems: Number(round.total_items ?? 0),
        suppliersCompleted: Number(round.suppliers_completed ?? 0),
        totalSuppliers: Number(round.total_suppliers ?? 0),
        ordersCreated: Number(round.orders_created ?? 0),
        status,
      },
      passo,
      podeAgir: passo.permission === null || permissions.has(passo.permission),
      podeEditar:
        podeEditarRodada && status !== "completed" && status !== "cancelled",
    };
  });

  return (
    <>
      {rounds.length > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={filtrando ? "Rodadas nesta seleção" : "Rodadas"}
            value={String(resumo.quantidade)}
            hint={`${resumo.emPreparacao} ainda em preparação`}
          />
          <Metric
            label="Em andamento"
            value={String(resumo.emAndamento)}
            hint="cotações abertas agora"
            href="/compras?situacao=active"
          />
          <Metric
            label="Aguardando resposta"
            value={String(resumo.aguardandoResposta)}
            hint="fornecedores que ainda não responderam"
            href="/compras?situacao=aguardando"
          />
          <Metric
            label="Pedidos gerados"
            value={String(resumo.pedidosGerados)}
            hint="decisões de compra que viraram pedido"
            href="/pedidos"
          />
        </div>
      ) : null}

      {rounds.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={
            filtrando ? "Nenhuma rodada neste recorte" : "Nenhuma rodada ainda"
          }
          description={
            filtrando
              ? "Nenhuma rodada casa com o filtro aplicado. Limpe o recorte para ver todas."
              : "A rodada é o contêiner de um ciclo: agrupa produtos, convida fornecedores, recebe respostas e vira pedido. Ela nasce em preparação — nada é enviado até você iniciá-la."
          }
          action={
            filtrando ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/compras">Limpar filtros</Link>
              </Button>
            ) : podeCriar ? (
              <NewRoundDialog rotulo="Criar a primeira rodada" />
            ) : null
          }
        />
      ) : (
        <>
          <div className="sm:hidden">
            <AdaptivePageSize current={pagination.pageSize} minRows={1} />
            <div className="flex flex-col gap-3">
              {presentedRounds.map((item) => (
                <RoundMobileCard key={item.round.id} {...item} />
              ))}
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={rounds.length}
                allowPageSize={false}
              />
            </div>
          </div>
          <div className="hidden sm:contents">
            <AdaptivePageSize current={pagination.pageSize} />
            <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs">
              <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                  {/* No celular sobram Rodada, Situação e a ação. O que some da
                  linha reaparece embaixo do título, para a tabela não rolar de
                  lado e levar o botão para fora da tela. */}
                  <TableHead>Rodada</TableHead>
                  <TableHead className="hidden lg:table-cell">Criada</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Produtos
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Responderam
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Pedidos
                  </TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Próximo passo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presentedRounds.map((item) => (
                  <RoundRow key={item.round.id} {...item} />
                ))}
              </TableBody>
              </Table>
              <DataTablePagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={rounds.length}
                allowPageSize={false}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
