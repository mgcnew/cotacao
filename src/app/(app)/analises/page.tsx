import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FilterBar } from "@/components/analytics/filter-bar";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFilterOptions,
  hasAnyFilter,
  parseFilters,
} from "@/features/analytics/filters";
import {
  getAnalyticsCoverage,
  getPriceHistory,
  getSavingsSummary,
  getSupplierPerformance,
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

/** Cartão de indicador. O rodapé explica de onde o número saiu. */
export default async function AnalisesPage({
  searchParams,
}: PageProps<"/analises">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("analytics.view")) redirect("/dashboard");

  const filters = parseFilters(await searchParams);
  const filtrando = hasAnyFilter(filters);

  const [savings, performance, prices, coverage, options] = await Promise.all([
    getSavingsSummary(company.companyId, filters),
    getSupplierPerformance(company.companyId, filters),
    getPriceHistory(company.companyId, filters),
    getAnalyticsCoverage(company.companyId),
    getFilterOptions(company.companyId),
  ]);

  const semRecebimento = coverage.receipts === 0;

  return (
    <div className="w-full">
      <PageHeader
        title="Análises"
        description="O dashboard mostra situação; aqui é o comportamento. Todo número sai de view do banco, não de conta feita na tela."
      />

      <FilterBar filters={filters} options={options} />

      {semRecebimento ? (
        <div className="border-border bg-surface-sunken mb-6 flex items-start gap-3 rounded-xl border p-4">
          <BarChart3
            className="text-fg-subtle mt-0.5 size-5 shrink-0"
            aria-hidden
          />
          <div className="text-sm">
            <p className="text-fg font-medium">
              A economia só aparece depois do primeiro recebimento
            </p>
            <p className="text-fg-muted mt-1">
              Economia realizada compara o preço cotado com o que veio na nota
              fiscal — sem mercadoria recebida, não existe preço praticado para
              comparar. Hoje: {coverage.rounds}{" "}
              {coverage.rounds === 1 ? "rodada" : "rodadas"},{" "}
              {coverage.responses}{" "}
              {coverage.responses === 1 ? "resposta" : "respostas"},{" "}
              {coverage.orders} {coverage.orders === 1 ? "pedido" : "pedidos"} e{" "}
              <strong>nenhum recebimento</strong>.{" "}
              <Link href="/pedidos" className="text-primary">
                Ver pedidos
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="text-fg mb-3 text-sm font-semibold">Economia</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Economia negociada"
            value={MONEY.format(savings.negotiated)}
            hint="Cotado menos combinado, sobre o que foi recebido"
          />
          <Metric
            label="Economia realizada"
            value={MONEY.format(savings.realized)}
            hint="Cotado menos o preço da nota fiscal"
            tone={savings.realized > 0 ? "good" : "neutral"}
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
                ? "Sem economia negociada para comparar"
                : "Quanto da negociação sobreviveu até a nota"
            }
          />
          <Metric
            label="Impacto de divergências"
            value={MONEY.format(savings.divergenceImpact)}
            hint="Cobrado a mais que o combinado"
            tone={savings.divergenceImpact > 0 ? "bad" : "neutral"}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Fornecedores</h2>
        <p className="text-fg-muted mb-3 text-sm">
          Taxa de resposta é quantas vezes o fornecedor respondeu, sobre quantas
          foi convidado a cotar.
          {filters.de || filters.ate ? (
            <span className="text-fg-subtle block">
              O recorte de período não se aplica a esta tabela: a base de
              participação não guarda data. Categoria, produto e fornecedor
              valem normalmente.
            </span>
          ) : null}
        </p>

        {performance.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            {filtrando
              ? "Nenhum fornecedor no recorte escolhido."
              : "Ainda não há histórico de participação. Ele começa quando um fornecedor entra numa rodada."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Convites</TableHead>
                <TableHead className="text-right">Respostas</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.map((s) => (
                <TableRow key={s.supplierId}>
                  <TableCell className="font-medium">
                    {s.supplierName}
                  </TableCell>
                  <TableCell className="text-fg-muted text-right tabular-nums">
                    {s.opportunities}
                  </TableCell>
                  <TableCell className="text-fg-muted text-right tabular-nums">
                    {s.responses}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.responseRate === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <Badge
                        variant={
                          s.responseRate >= 0.7 ? "default" : "secondary"
                        }
                      >
                        {PERCENT.format(s.responseRate)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-fg-muted text-right tabular-nums">
                    {s.purchaseOrders}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Preços por produto e fornecedor
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Os três momentos do preço: o que foi cotado, o que foi combinado
          depois da negociação e o que a nota cobrou.
        </p>

        {prices.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            {filtrando
              ? "Nenhum recebimento no recorte escolhido."
              : "Cada recebimento registrado acrescenta uma linha aqui."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Cotado</TableHead>
                <TableHead className="text-right">Combinado</TableHead>
                <TableHead className="text-right">Praticado</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Recebido em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.map((row, index) => (
                <TableRow key={`${row.productName}-${row.supplierName}-${index}`}>
                  <TableCell className="font-medium">
                    {row.productName}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {row.supplierName}
                  </TableCell>
                  <TableCell className="text-fg-muted text-right tabular-nums">
                    {row.quoted === null ? "—" : MONEY.format(row.quoted)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {MONEY.format(row.agreed)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      row.practiced > row.agreed
                        ? "text-destructive font-medium"
                        : "text-fg"
                    }`}
                  >
                    {MONEY.format(row.practiced)}
                  </TableCell>
                  <TableCell className="text-fg-muted text-right tabular-nums">
                    {QTY.format(row.quantity)}
                  </TableCell>
                  <TableCell className="text-fg-subtle text-xs">
                    {row.receivedAt
                      ? new Date(row.receivedAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
