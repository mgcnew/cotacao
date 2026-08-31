import { BarChart3, PackageCheck, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FilterBar } from "@/components/analytics/filter-bar";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCompany } from "@/features/company/queries";
import {
  getFilterOptions,
  hasAnyFilter,
  parseFilters,
} from "@/features/analytics/filters";
import {
  getAnalyticsCoverage,
  getPriceHistory,
  getReceiptSummary,
  getSavingsSummary,
  getSupplierPerformance,
  type PriceRow,
} from "@/features/analytics/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(
  value: string | string[] | undefined,
  fallback: number,
) {
  const parsed = Number(first(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDate(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(
        new Date(value),
      )
    : "—";
}

function resultTone(value: number | null) {
  if (value === null || value === 0) return "neutral" as const;
  return value > 0 ? ("good" as const) : ("bad" as const);
}

export default async function AnalisesPage({
  searchParams,
}: PageProps<"/analises">) {
  const membership = await requireActiveCompany();
  const permissions = await getPermissions(membership.companyId);
  if (!permissions.has("analytics.view")) redirect("/dashboard");

  const params = await searchParams;
  const filters = parseFilters(params);
  const requestedSize = positiveInteger(params.por_pagina_precos, 10);
  const pageSize = [10, 20, 30].includes(requestedSize) ? requestedSize : 10;
  const page = positiveInteger(params.pagina_precos, 1);

  const [
    company,
    savings,
    receipts,
    performance,
    priceData,
    coverage,
    options,
  ] = await Promise.all([
    getCompany(membership.companyId),
    getSavingsSummary(membership.companyId, filters),
    getReceiptSummary(membership.companyId, filters),
    getSupplierPerformance(membership.companyId, filters),
    getPriceHistory(membership.companyId, filters, { page, pageSize }),
    getAnalyticsCoverage(membership.companyId),
    getFilterOptions(membership.companyId),
  ]);

  const timezone = company?.timezone ?? "America/Sao_Paulo";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  const filtering = hasAnyFilter(filters);
  const noReceiptHistory = coverage.receipts === 0;
  const suppliers = performance.rows;
  const invalidPeriod = Boolean(
    filters.de && filters.ate && filters.de > filters.ate,
  );

  return (
    <div className="w-full">
      <PageHeader
        title="Análises"
        description="Investigue compras, resultados, preços e fornecedores usando o mesmo recorte de dados."
      />

      <FilterBar filters={filters} options={options} today={today} />

      {invalidPeriod ? (
        <div className="border-destructive/35 bg-destructive-soft text-destructive mb-6 rounded-xl border px-4 py-3 text-sm">
          A data inicial está depois da data final. Ajuste o período para obter
          resultados.
        </div>
      ) : null}

      {noReceiptHistory ? <EmptyCoverage coverage={coverage} /> : null}

      <section className="mb-6" aria-labelledby="received-summary">
        <SectionHeading
          id="received-summary"
          title="Compras efetivamente recebidas"
          description="Inclui pedidos originados de cotação e pedidos diretos no período selecionado."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Valor recebido"
            value={MONEY.format(receipts.total)}
            hint="Preço da nota × quantidade conferida"
          />
          <Metric
            label="Itens conferidos"
            value={String(receipts.items)}
            hint="Linhas de produto efetivamente recebidas"
          />
          <Metric
            label="Entregas conferidas"
            value={String(receipts.receipts)}
            hint="Recebimentos finalizados no recorte"
          />
          <Metric
            label="Pedidos envolvidos"
            value={String(receipts.orders)}
            hint="Pedidos distintos com mercadoria recebida"
          />
        </div>
      </section>

      <section className="mb-6" aria-labelledby="financial-results">
        <SectionHeading
          id="financial-results"
          title="Resultado financeiro dos itens cotados"
          description="Compara proposta inicial, preço combinado no pedido e preço conferido na nota. A escolha de embalagens aparece separada e não altera os demais resultados."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Resultado negociado recebido"
            value={MONEY.format(savings.negotiated)}
            hint="Cotado menos pedido, sobre o que já chegou"
            tone={resultTone(savings.negotiated)}
          />
          <Metric
            label="Resultado efetivo vs. cotado"
            value={MONEY.format(savings.realized)}
            hint="Cotado menos valor efetivo da nota"
            tone={resultTone(savings.realized)}
          />
          <Metric
            label="Escolha de embalagens"
            value={MONEY.format(savings.packagingChoice)}
            hint="Vencedor por unidade versus melhor alternativa"
            tone={resultTone(savings.packagingChoice)}
          />
          <Metric
            label="Taxa de captura"
            value={
              savings.captureRate === null
                ? "—"
                : PERCENT.format(savings.captureRate)
            }
            hint={
              savings.captureRate === null
                ? "Sem economia positiva para comparar"
                : "Quanto da negociação permaneceu na nota"
            }
          />
          <Metric
            label="Diferença da nota x pedido"
            value={MONEY.format(savings.divergenceImpact)}
            hint="Positivo: pago a mais. Negativo: pago a menos"
            tone={
              savings.divergenceImpact > 0
                ? "bad"
                : savings.divergenceImpact < 0
                  ? "good"
                  : "neutral"
            }
          />
        </div>
        <div className="border-border bg-surface mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-4">
          <ResultCount
            icon={TrendingDown}
            label="Itens com economia"
            value={savings.economyItems}
            tone="good"
          />
          <ResultCount
            icon={TrendingUp}
            label="Itens com acréscimo"
            value={savings.costItems}
            tone="bad"
          />
          <ResultCount
            icon={ReceiptText}
            label="Itens divergentes"
            value={savings.divergentItems}
            tone="neutral"
          />
          <ResultCount
            icon={PackageCheck}
            label="Embalagens com ganho"
            value={savings.packagingChoiceItems}
            tone="good"
          />
        </div>
      </section>

      <section className="border-border bg-surface mb-6 overflow-hidden rounded-2xl border shadow-xs">
        <header className="border-border border-b px-4 py-4 sm:px-5">
          <h2 className="text-fg text-sm font-semibold">
            Desempenho dos fornecedores
          </h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            Convites, respostas e decisões dentro do período e dos filtros
            selecionados. Vitória considera apenas disputas decididas entre
            ganhou e não ganhou.
          </p>
        </header>

        {performance.lifetimeFallback ? (
          <div className="border-warning/30 bg-warning-soft text-warning border-b px-4 py-3 text-xs sm:px-5">
            Exibindo temporariamente o histórico geral dos fornecedores. A
            migration 0063 habilita período, vitórias e resultados neste painel
            sem atingir o limite do banco.
          </div>
        ) : null}

        {suppliers.length === 0 ? (
          <EmptyState
            message={
              filtering
                ? "Nenhum fornecedor corresponde a este recorte."
                : "Ainda não há participação de fornecedores para analisar."
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Convites</TableHead>
                    <TableHead className="text-right">Respostas</TableHead>
                    <TableHead className="text-right">Ganhou</TableHead>
                    <TableHead className="text-right">Não ganhou</TableHead>
                    <TableHead className="text-right">Vitória</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead>Última rodada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.supplierId}>
                      <TableCell>
                        <Link
                          href={`/fornecedores/${supplier.supplierId}/historico`}
                          className="text-fg hover:text-primary font-medium"
                        >
                          {supplier.supplierName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {supplier.opportunities}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">
                          {supplier.responses}
                        </span>
                        <span className="text-fg-subtle ml-1 text-xs">
                          (
                          {supplier.responseRate === null
                            ? "—"
                            : PERCENT.format(supplier.responseRate)}
                          )
                        </span>
                        <p className="text-fg-subtle mt-0.5 text-[11px]">
                          {supplier.noResponses} sem resposta ·{" "}
                          {supplier.unavailable} não fornece
                        </p>
                      </TableCell>
                      <TableCell className="text-success text-right font-medium tabular-nums">
                        {supplier.wins}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {supplier.losses}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            supplier.winRate !== null && supplier.winRate >= 0.5
                              ? "default"
                              : "secondary"
                          }
                        >
                          {supplier.winRate === null
                            ? "—"
                            : PERCENT.format(supplier.winRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {supplier.purchaseOrders}
                      </TableCell>
                      <TableCell className="text-fg-subtle text-xs">
                        {formatDate(supplier.lastRoundAt, timezone)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-border divide-y lg:hidden">
              {suppliers.map((supplier) => (
                <article key={supplier.supplierId} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/fornecedores/${supplier.supplierId}/historico`}
                        className="text-fg hover:text-primary font-medium"
                      >
                        {supplier.supplierName}
                      </Link>
                      <p className="text-fg-subtle mt-0.5 text-xs">
                        Última rodada{" "}
                        {formatDate(supplier.lastRoundAt, timezone)}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {supplier.purchaseOrders}{" "}
                      {supplier.purchaseOrders === 1 ? "pedido" : "pedidos"}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <Stat label="Convites" value={supplier.opportunities} />
                    <Stat
                      label="Respostas"
                      value={`${supplier.responses} · ${supplier.responseRate === null ? "—" : PERCENT.format(supplier.responseRate)}`}
                    />
                    <Stat
                      label="Sem resposta / não fornece"
                      value={`${supplier.noResponses} / ${supplier.unavailable}`}
                    />
                    <Stat
                      label="Ganhou / perdeu"
                      value={`${supplier.wins} / ${supplier.losses}`}
                    />
                    <Stat
                      label="Taxa de vitória"
                      value={
                        supplier.winRate === null
                          ? "—"
                          : PERCENT.format(supplier.winRate)
                      }
                    />
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="border-border bg-surface overflow-hidden rounded-2xl border shadow-xs">
        <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-fg text-sm font-semibold">
              Aferição por produto recebido
            </h2>
            <p className="text-fg-muted mt-0.5 text-xs">
              Cada linha explica quanto o preço evoluiu do cotado até a nota.
            </p>
          </div>
          <Badge variant="outline">
            {priceData.total} {priceData.total === 1 ? "registro" : "registros"}
          </Badge>
        </header>

        {priceData.rows.length === 0 ? (
          <EmptyState
            message={
              filtering
                ? "Nenhum item recebido corresponde a este recorte."
                : "Cada recebimento originado de cotação acrescentará uma linha aqui."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto / fornecedor</TableHead>
                    <TableHead className="text-right">Cotado</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Nota</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Nota x pedido</TableHead>
                    <TableHead>Recebido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceData.rows.map((row, index) => (
                    <PriceTableRow
                      key={`${row.receiptId}-${row.productName}-${index}`}
                      row={row}
                      timezone={timezone}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-border divide-y md:hidden">
              {priceData.rows.map((row, index) => (
                <PriceCard
                  key={`${row.receiptId}-${row.productName}-${index}`}
                  row={row}
                  timezone={timezone}
                />
              ))}
            </div>
            <DataTablePagination
              page={priceData.page}
              pageSize={priceData.pageSize}
              total={priceData.total}
              pageParam="pagina_precos"
              pageSizeParam="por_pagina_precos"
            />
          </>
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-fg text-sm font-semibold">
        {title}
      </h2>
      <p className="text-fg-muted mt-0.5 text-xs">{description}</p>
    </div>
  );
}

function ResultCount({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingDown;
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-success bg-success-soft"
      : tone === "bad"
        ? "text-destructive bg-destructive-soft"
        : "text-fg-muted bg-surface-muted";
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${color}`}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-fg text-sm font-semibold tabular-nums">{value}</p>
        <p className="text-fg-muted text-xs">{label}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function ResultBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="secondary">Sem referência</Badge>;
  return (
    <Badge
      variant={value < 0 ? "destructive" : value > 0 ? "default" : "secondary"}
      className={value > 0 ? "bg-success text-white" : undefined}
    >
      {MONEY.format(value)}
    </Badge>
  );
}

function PriceTableRow({ row, timezone }: { row: PriceRow; timezone: string }) {
  return (
    <TableRow>
      <TableCell>
        <p className="text-fg font-medium">{row.productName}</p>
        <p className="text-fg-subtle text-xs">{row.supplierName}</p>
      </TableCell>
      <TableCell className="text-fg-muted text-right tabular-nums">
        {row.quoted === null ? "—" : MONEY.format(row.quoted)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {MONEY.format(row.agreed)}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${row.practiced > row.agreed ? "text-destructive font-medium" : ""}`}
      >
        {MONEY.format(row.practiced)}
      </TableCell>
      <TableCell className="text-fg-muted text-right tabular-nums">
        {QTY.format(row.quantity)}
      </TableCell>
      <TableCell className="text-right">
        <ResultBadge value={row.realizedResult} />
      </TableCell>
      <TableCell
        className={`text-right font-medium tabular-nums ${row.divergence > 0 ? "text-destructive" : row.divergence < 0 ? "text-success" : "text-fg-muted"}`}
      >
        {MONEY.format(row.divergence)}
      </TableCell>
      <TableCell className="text-fg-subtle text-xs">
        <p>{formatDate(row.receivedAt, timezone)}</p>
        {row.orderId ? (
          <Link
            href={`/pedidos/${row.orderId}`}
            className="text-primary hover:underline"
          >
            Ver pedido
          </Link>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function PriceCard({ row, timezone }: { row: PriceRow; timezone: string }) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-fg font-medium">{row.productName}</p>
          <p className="text-fg-muted text-xs">
            {row.supplierName} · {formatDate(row.receivedAt, timezone)}
          </p>
        </div>
        <ResultBadge value={row.realizedResult} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Stat
          label="Cotado"
          value={row.quoted === null ? "—" : MONEY.format(row.quoted)}
        />
        <Stat label="Pedido" value={MONEY.format(row.agreed)} />
        <Stat label="Nota" value={MONEY.format(row.practiced)} />
        <Stat label="Quantidade" value={QTY.format(row.quantity)} />
        <Stat label="Nota x pedido" value={MONEY.format(row.divergence)} />
      </dl>
      {row.orderId ? (
        <Link
          href={`/pedidos/${row.orderId}`}
          className="text-primary mt-3 inline-flex text-xs font-medium hover:underline"
        >
          Abrir pedido
        </Link>
      ) : null}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-7">
      <BarChart3 className="text-fg-subtle size-5 shrink-0" aria-hidden />
      <p className="text-fg-muted text-sm">{message}</p>
    </div>
  );
}

function EmptyCoverage({
  coverage,
}: {
  coverage: {
    rounds: number;
    responses: number;
    orders: number;
    receipts: number;
  };
}) {
  return (
    <div className="border-border bg-surface-sunken mb-6 flex items-start gap-3 rounded-xl border p-4">
      <BarChart3
        className="text-fg-subtle mt-0.5 size-5 shrink-0"
        aria-hidden
      />
      <div className="text-sm">
        <p className="text-fg font-medium">
          Ainda não existe recebimento conferido
        </p>
        <p className="text-fg-muted mt-1">
          Já existem {coverage.rounds} rodadas, {coverage.responses} respostas e{" "}
          {coverage.orders} pedidos. Os resultados financeiros começam quando a
          primeira mercadoria for conferida.{" "}
          <Link href="/pedidos" className="text-primary">
            Ver pedidos
          </Link>
        </p>
      </div>
    </div>
  );
}
