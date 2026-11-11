import {
  BarChart3,
  Info,
  PackageCheck,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  FilterBar,
  formatDay,
  periodPresets,
} from "@/components/analytics/filter-bar";
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
import { Tooltip } from "@/components/ui/tooltip";
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
  const preset = periodPresets(today).find(
    (item) => item.de === filters.de && item.ate === filters.ate,
  );
  // A descrição diz o recorte que está valendo, que é o que muda; a explicação
  // fixa da página fica no (i).
  const nomeDoAtalho = preset?.label.endsWith("dias")
    ? `Últimos ${preset.label}`
    : preset?.label;
  const periodo = preset?.de
    ? `${nomeDoAtalho}, de ${formatDay(preset.de)} a ${formatDay(today)}`
    : filters.de && filters.ate
      ? `De ${formatDay(filters.de)} a ${formatDay(filters.ate)}`
      : filters.de
        ? `Desde ${formatDay(filters.de)}`
        : filters.ate
          ? `Até ${formatDay(filters.ate)}`
          : "Todo o período";

  return (
    <div className="w-full">
      <PageHeader
        title="Análises"
        description={periodo}
        info="Compras recebidas, resultado da negociação, desempenho dos fornecedores e aferição de preços, todos no mesmo recorte."
      />

      <FilterBar filters={filters} options={options} today={today} />

      {invalidPeriod ? (
        <div
          role="alert"
          className="border-destructive/35 bg-destructive-soft text-destructive mb-6 rounded-xl border px-4 py-3 text-sm"
        >
          A data inicial está depois da data final. Ajuste o período para obter
          resultados.
        </div>
      ) : null}

      {noReceiptHistory ? <EmptyCoverage coverage={coverage} /> : null}

      <section className="mb-6" aria-labelledby="received-summary">
        <SectionHeading
          id="received-summary"
          title="Compras efetivamente recebidas"
          description="Pedidos de rodada e pedidos diretos que chegaram no período."
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
          description="Do preço cotado ao preço que a nota cobrou."
          info="Compara proposta inicial, preço combinado no pedido e preço conferido na nota. A escolha de embalagens aparece separada e não altera os demais resultados."
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

      <section
        aria-labelledby="supplier-performance"
        className="border-border bg-surface mb-6 overflow-hidden rounded-xl border"
      >
        <header className="border-border border-b px-4 py-3">
          <SectionHeading
            id="supplier-performance"
            title="Desempenho dos fornecedores"
            description="Disputa por item cotado e entrega por pedido recebido."
            info="A disputa é contada por item cotado, que é como o fornecedor concorre: vitória considera apenas os itens decididos entre ganhou e não ganhou. Já a entrega conta pedidos recebidos por inteiro, inclusive os feitos sem cotação, pela data em que a mercadoria chegou."
            className="mb-0"
          />
        </header>

        {performance.lifetimeFallback ? (
          <div className="border-warning/30 bg-warning-soft text-warning border-b px-4 py-3 text-xs sm:px-5">
            Exibindo temporariamente o histórico geral dos fornecedores. A
            migration 0063 habilita período, vitórias e resultados neste painel
            sem atingir o limite do banco.
          </div>
        ) : null}

        {!performance.deliveryAvailable ? (
          <div className="border-warning/30 bg-warning-soft text-warning border-b px-4 py-3 text-xs sm:px-5">
            Pedidos concluídos e valor recebido ficam sem número até a migration
            0114 ser aplicada. As colunas de cotação não dependem dela.
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
                    <TableHead className="text-right">Itens cotados</TableHead>
                    <TableHead className="text-right">Respostas</TableHead>
                    <TableHead className="text-right">
                      Ganhos / perdidos
                    </TableHead>
                    <TableHead className="text-right">Vitória</TableHead>
                    <TableHead className="text-right">
                      Pedidos concluídos
                    </TableHead>
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
                        <p className="text-fg-subtle mt-0.5 text-xs">
                          {supplier.noResponses} sem resposta ·{" "}
                          {supplier.unavailable} não fornece
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-success font-medium">
                          {supplier.wins}
                        </span>
                        <span className="text-fg-subtle"> / </span>
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
                      <TableCell className="text-right">
                        <span className="tabular-nums">
                          {performance.deliveryAvailable
                            ? supplier.completedOrders
                            : "—"}
                        </span>
                        {performance.deliveryAvailable ? (
                          <p className="text-fg-subtle mt-0.5 text-xs">
                            {MONEY.format(supplier.receivedTotal)} recebido
                            {supplier.divergences > 0
                              ? ` · ${supplier.divergences} ${
                                  supplier.divergences === 1
                                    ? "divergência"
                                    : "divergências"
                                }`
                              : ""}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-fg-subtle text-xs whitespace-nowrap tabular-nums">
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
                      {performance.deliveryAvailable
                        ? `${supplier.completedOrders} ${
                            supplier.completedOrders === 1
                              ? "pedido concluído"
                              : "pedidos concluídos"
                          }`
                        : "entrega indisponível"}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <Stat label="Itens cotados" value={supplier.opportunities} />
                    <Stat
                      label="Respostas"
                      value={`${supplier.responses} · ${supplier.responseRate === null ? "—" : PERCENT.format(supplier.responseRate)}`}
                    />
                    <Stat
                      label="Sem resposta / não fornece"
                      value={`${supplier.noResponses} / ${supplier.unavailable}`}
                    />
                    <Stat
                      label="Itens ganhos / perdidos"
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
                    {performance.deliveryAvailable ? (
                      <Stat
                        label="Recebido / divergências"
                        value={`${MONEY.format(supplier.receivedTotal)} / ${supplier.divergences}`}
                      />
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section
        aria-labelledby="price-history"
        className="border-border bg-surface overflow-hidden rounded-xl border"
      >
        <header className="border-border flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
          <SectionHeading
            id="price-history"
            title="Aferição por produto recebido"
            description="Quanto o preço andou do cotado até a nota, item a item."
            className="mb-0"
          />
          <p className="text-fg-muted text-xs tabular-nums sm:pt-0.5">
            {priceData.total} {priceData.total === 1 ? "item" : "itens"}
          </p>
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

/**
 * Título de bloco com uma frase curta. A regra completa de cada número fica no
 * (i), como no cabeçalho da página: ajuda no primeiro dia e não ocupa espaço
 * nos outros.
 */
function SectionHeading({
  id,
  title,
  description,
  info,
  className = "mb-3",
}: {
  id: string;
  title: string;
  description: string;
  info?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2
        id={id}
        className="text-fg flex items-center gap-1 text-sm font-semibold"
      >
        {title}
        {info ? (
          <Tooltip content={info} side="bottom">
            <button
              type="button"
              aria-label={info}
              className="text-fg-subtle hover:text-fg-muted grid size-6 place-items-center rounded-sm"
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        ) : null}
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

/** Economia em verde suave, acréscimo em vermelho suave: estado nunca é sólido. */
function ResultBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="secondary">Sem referência</Badge>;
  return (
    <Badge
      variant={value < 0 ? "destructive" : "secondary"}
      className={
        value > 0
          ? "border-success/25 bg-success-soft text-success tabular-nums"
          : "tabular-nums"
      }
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
        <p className="tabular-nums">{formatDate(row.receivedAt, timezone)}</p>
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
