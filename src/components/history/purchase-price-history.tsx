import Link from "next/link";

import {
  PriceHistoryChart,
  type PriceHistoryPoint,
} from "@/components/history/price-history-chart";
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
import type { PurchasePriceHistoryRow } from "@/features/receipts/historical-queries";

const DATE = new Intl.DateTimeFormat("pt-BR");
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function PurchasePriceHistory({
  scope,
  rows,
  pagination,
  pricePoints,
}: {
  scope: "product" | "supplier";
  rows: PurchasePriceHistoryRow[];
  pagination: { page: number; pageSize: number; total: number };
  pricePoints: PriceHistoryPoint[];
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-fg font-semibold">Compras efetivas</h2>
        <p className="text-fg-muted mt-1 text-sm">
          Preços realmente praticados em recebimentos e NF-e históricas, sem
          simular cotações antigas.
        </p>
      </div>
      {scope === "product" ? (
        <PriceHistoryChart
          points={pricePoints}
          title="Evolução do preço praticado"
          description="Valores efetivamente pagos, organizados pela data do recebimento ou emissão da NF-e histórica."
        />
      ) : null}
      {rows.length === 0 ? (
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          Nenhuma compra efetiva encontrada neste recorte.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableHead>Data</TableHead>
                <TableHead>
                  {scope === "product" ? "Fornecedor" : "Produto"}
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  Quantidade
                </TableHead>
                <TableHead>Preço praticado</TableHead>
                <TableHead className="hidden md:table-cell">Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.source}-${row.event_id}`}>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {DATE.format(new Date(row.occurred_at))}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={
                        scope === "product"
                          ? `/fornecedores/${row.supplier_id}/historico`
                          : `/produtos/historico/${row.product_id}`
                      }
                      className="text-fg font-medium hover:underline"
                    >
                      {scope === "product"
                        ? row.supplier_name
                        : row.product_name}
                    </Link>
                    <span className="text-fg-subtle block text-xs sm:hidden">
                      {NUMBER.format(row.pricing_quantity)}{" "}
                      {row.pricing_unit_symbol ?? ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted hidden tabular-nums sm:table-cell">
                    {NUMBER.format(row.pricing_quantity)}{" "}
                    {row.pricing_unit_symbol ?? ""}
                  </TableCell>
                  <TableCell className="text-fg font-medium tabular-nums">
                    {MONEY.format(row.practiced_price)}
                    {row.pricing_unit_symbol
                      ? `/${row.pricing_unit_symbol}`
                      : ""}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">
                      {row.source === "historical_nfe"
                        ? "NF-e histórica"
                        : "Recebimento"}
                    </Badge>
                    {row.invoice_number ? (
                      <span className="text-fg-subtle mt-1 block text-xs">
                        NF {row.invoice_number}
                      </span>
                    ) : null}
                    {row.issuer_name ? (
                      <span className="text-fg-subtle block max-w-48 truncate text-xs">
                        Emitente: {row.issuer_name}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            allowPageSize={false}
            pageParam="compras_pagina"
            pageSizeParam="compras_por_pagina"
          />
        </div>
      )}
    </section>
  );
}
