import { Plus, ShoppingCart } from "lucide-react";
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
import { ResponseProgress } from "@/components/rounds/response-progress";
import { RoundFilterBar } from "@/components/rounds/round-filter-bar";
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
  hasAnyRoundFilter,
  parseRoundFilters,
  type RoundFilters,
} from "@/features/rounds/filters";
import {
  listRoundsWithProgress,
  summarizeRounds,
} from "@/features/rounds/queries";
import {
  ROUND_STATUS_LABEL,
  roundNextStep,
  roundStatusTone,
} from "@/features/rounds/status";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/**
 * A tela em si só decide o que pode ser mostrado — decisão barata, uma ida ao
 * banco — e entrega o cabeçalho e os filtros na hora. A lista, que é a parte
 * cara, chega depois pelo `Suspense` abaixo.
 *
 * A ordem em que a tela aparece passa a ser a ordem em que ela é útil: o botão
 * "Nova rodada" e o campo de busca já respondem enquanto as rodadas ainda vêm.
 */
export default async function ComprasPage({
  searchParams,
}: PageProps<"/compras">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("purchase_round.view")) redirect("/dashboard");

  const filters = parseRoundFilters(await searchParams);
  const podeCriar = permissions.has("purchase_round.create");

  return (
    <div className="w-full">
      <PageHeader
        title="Compras"
        description="Cada rodada reúne produtos, convida fornecedores, recebe preços e vira pedido."
        action={
          podeCriar ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/compras/nova">
                <Plus className="size-3.5" aria-hidden /> Nova rodada
              </Link>
            </Button>
          ) : null
        }
      />

      <RoundFilterBar filters={filters} />

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
}: {
  companyId: string;
  filters: RoundFilters;
  permissions: Set<string>;
  podeCriar: boolean;
}) {
  const filtrando = hasAnyRoundFilter(filters);
  const rounds = await listRoundsWithProgress(companyId, filters);
  const resumo = summarizeRounds(rounds);

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
              <Button asChild size="sm">
                <Link href="/compras/nova">Criar a primeira rodada</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
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
            {rounds.map((round) => {
              const id = round.purchase_round_id ?? "";
              const status = round.status ?? "";
              const passo = roundNextStep(status, {
                suppliersPending: Number(round.suppliers_pending ?? 0),
                ordersCreated: Number(round.orders_created ?? 0),
              });
              // Sem a permissão o passo existe, mas não é desta pessoa: o botão
              // vira apenas a porta de entrada da rodada.
              const podeAgir =
                passo.permission === null || permissions.has(passo.permission);

              return (
                <TableRow key={id}>
                  <TableCell>
                    <Link
                      href={`/compras/${id}`}
                      className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {round.title}
                    </Link>
                    <span className="text-fg-muted block max-w-36 text-xs whitespace-normal tabular-nums sm:hidden">
                      {round.total_items}{" "}
                      {Number(round.total_items) === 1 ? "produto" : "produtos"}{" "}
                      · {round.suppliers_completed} de {round.total_suppliers}{" "}
                      responderam
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted hidden text-xs tabular-nums lg:table-cell">
                    {round.created_at
                      ? DATA.format(new Date(round.created_at))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted hidden text-right tabular-nums sm:table-cell">
                    {round.total_items}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ResponseProgress
                      completed={Number(round.suppliers_completed ?? 0)}
                      total={Number(round.total_suppliers ?? 0)}
                    />
                  </TableCell>
                  <TableCell className="text-fg-muted hidden text-right tabular-nums lg:table-cell">
                    {round.orders_created}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roundStatusTone(status)}>
                      {ROUND_STATUS_LABEL[status] ?? status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      size="sm"
                      variant={passo.pending && podeAgir ? "default" : "outline"}
                    >
                      <Link href={`/compras/${id}${passo.path}`}>
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
      )}
    </>
  );
}
