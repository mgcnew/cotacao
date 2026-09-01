import Link from "next/link";

import {
  PriceHistoryChart,
  type PriceHistoryPoint,
} from "@/components/history/price-history-chart";
import { Metric } from "@/components/layout/metric";
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
  HISTORY_OUTCOMES,
  HISTORY_OUTCOME_LABEL,
  type HistoryFilters,
  type HistorySummary,
  type QuotationHistoryRow,
} from "@/features/history/queries";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const DATE = new Intl.DateTimeFormat("pt-BR");

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function outcomeVariant(outcome: QuotationHistoryRow["outcome"]) {
  if (outcome === "won") return "default" as const;
  if (outcome === "lost" || outcome === "no_response") {
    return "destructive" as const;
  }
  if (outcome === "in_progress") return "secondary" as const;
  return "outline" as const;
}

function price(value: number | null, unit: string | null) {
  if (value === null) return "—";
  return `${MONEY.format(Number(value))}${unit ? `/${unit}` : ""}`;
}

function HistoryMetrics({
  scope,
  summary,
}: {
  scope: "product" | "supplier";
  summary: HistorySummary;
}) {
  if (scope === "product") {
    return (
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Último preço"
          value={summary.lastPrice === null ? "—" : MONEY.format(summary.lastPrice)}
          hint="Última proposta recebida no período"
        />
        <Metric
          label="Menor preço"
          value={summary.minPrice === null ? "—" : MONEY.format(summary.minPrice)}
          hint="Menor preço final cotado"
          tone="good"
        />
        <Metric
          label="Preço médio"
          value={
            summary.averagePrice === null
              ? "—"
              : MONEY.format(summary.averagePrice)
          }
          hint="Média das propostas válidas"
        />
        <Metric
          label="Maior preço"
          value={summary.maxPrice === null ? "—" : MONEY.format(summary.maxPrice)}
          hint={`${summary.opportunities} oportunidades no período`}
        />
      </div>
    );
  }

  const responseRate =
    summary.opportunities > 0
      ? summary.responses / summary.opportunities
      : null;

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric
        label="Rodadas"
        value={String(summary.rounds)}
        hint={`${summary.opportunities} itens convidados`}
      />
      <Metric
        label="Taxa de resposta"
        value={responseRate === null ? "—" : PERCENT.format(responseRate)}
        hint={`${summary.responses} respostas, ${summary.noResponses} ausências`}
      />
      <Metric
        label="Itens ganhos"
        value={String(summary.wins)}
        hint="Decisões confirmadas"
        tone="good"
      />
      <Metric
        label="Itens não ganhos"
        value={String(summary.losses)}
        hint="Respondeu, mas outro foi escolhido"
      />
      <Metric
        label="Pedidos gerados"
        value={String(summary.orders)}
        hint="Pedidos originados das rodadas"
      />
    </div>
  );
}

export function QuotationHistory({
  scope,
  rows,
  summary,
  options,
  filters,
  pagination,
  pricePoints,
  basePath,
}: {
  scope: "product" | "supplier";
  rows: QuotationHistoryRow[];
  summary: HistorySummary;
  options: { id: string; name: string }[];
  filters: HistoryFilters;
  pagination: { page: number; pageSize: number; total: number };
  pricePoints: PriceHistoryPoint[];
  basePath: string;
}) {
  const relatedKey = scope === "product" ? "fornecedor" : "produto";
  const relatedLabel = scope === "product" ? "Fornecedor" : "Produto";

  return (
    <>
      <HistoryMetrics scope={scope} summary={summary} />

      {scope === "product" ? <PriceHistoryChart points={pricePoints} /> : null}

      <form
        action={basePath}
        className="border-border bg-surface mb-5 rounded-xl border p-4"
      >
        <input type="hidden" name="por_pagina" value={filters.pageSize} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
            De
            <input
              type="date"
              name="de"
              defaultValue={filters.from ?? ""}
              className={selectClass}
            />
          </label>
          <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
            Até
            <input
              type="date"
              name="ate"
              defaultValue={filters.to ?? ""}
              className={selectClass}
            />
          </label>
          <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
            {relatedLabel}
            <select
              name={relatedKey}
              defaultValue={filters.relatedId ?? ""}
              className={selectClass}
            >
              <option value="">Todos</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-fg-muted flex flex-col gap-1.5 text-xs">
            Resultado
            <select
              name="resultado"
              defaultValue={filters.outcome ?? ""}
              className={selectClass}
            >
              <option value="">Todos</option>
              {HISTORY_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {HISTORY_OUTCOME_LABEL[outcome]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Aplicar filtros
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={basePath}>Limpar</Link>
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          Nenhuma participação encontrada neste recorte.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableHead>Rodada</TableHead>
                <TableHead>{relatedLabel}</TableHead>
                <TableHead className="hidden md:table-cell">Quantidade</TableHead>
                <TableHead className="hidden sm:table-cell">Preço</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="hidden lg:table-cell">Pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const initial =
                  row.quoted_price === null ? null : Number(row.quoted_price);
                const current =
                  row.current_price === null ? null : Number(row.current_price);
                const negotiated =
                  initial !== null && current !== null && initial !== current;
                return (
                  <TableRow
                    key={`${row.round_supplier_id}-${row.quotation_item_id}`}
                  >
                    <TableCell>
                      <Link
                        href={`/compras/${row.purchase_round_id}`}
                        className="text-fg font-medium hover:underline"
                      >
                        {row.round_title}
                      </Link>
                      <span className="text-fg-subtle block text-xs">
                        {row.round_created_at
                          ? DATE.format(new Date(row.round_created_at))
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={
                          scope === "product"
                            ? `/fornecedores/${row.supplier_id}/historico`
                            : `/produtos/historico/${row.product_id}`
                        }
                        className="text-fg-muted hover:text-fg hover:underline"
                      >
                        {scope === "product"
                          ? row.supplier_name
                          : row.product_name}
                      </Link>
                      <span className="text-fg-subtle mt-1 block text-xs sm:hidden">
                        {price(current, row.pricing_unit_symbol)}
                      </span>
                    </TableCell>
                    <TableCell className="text-fg-muted hidden tabular-nums md:table-cell">
                      {NUMBER.format(Number(row.requested_quantity ?? 0))} {row.purchase_unit_symbol}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-fg tabular-nums">
                        {price(current, row.pricing_unit_symbol)}
                      </span>
                      {negotiated ? (
                        <span className="text-fg-subtle block text-xs line-through">
                          {price(initial, row.pricing_unit_symbol)}
                        </span>
                      ) : null}
                      {row.practiced_price !== null ? (
                        <span className="text-fg-subtle block text-xs">
                          Nota: {price(Number(row.practiced_price), row.pricing_unit_symbol)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outcomeVariant(row.outcome)}>
                        {HISTORY_OUTCOME_LABEL[row.outcome]}
                      </Badge>
                      {row.won_quantity && row.won_quantity > 0 ? (
                        <span className="text-fg-subtle mt-1 block text-xs">
                          {NUMBER.format(Number(row.won_quantity))} {row.purchase_unit_symbol}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {row.order_id ? (
                        <Link
                          href={`/pedidos/${row.order_id}`}
                          className="text-primary text-sm hover:underline"
                        >
                          #{row.order_number}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DataTablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
          />
        </div>
      )}
    </>
  );
}
