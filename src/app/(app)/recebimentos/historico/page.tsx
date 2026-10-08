import { FileClock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HistoricalNfeUploadForm } from "@/components/receipts/historical-nfe-upload-form";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  contarHistoricalNfeFilters,
  historicalListQuery,
  HISTORICAL_STATUS_LABEL,
  parseHistoricalNfeFilters,
  type HistoricalNfeFilters,
  LOOKS_LIKE_ORDER,
  type HistoricalSituation,
  type HistoricalStatus,
} from "@/features/receipts/historical-filters";
import { listHistoricalNfeImports } from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

const BASE_PATH = "/recebimentos/historico";

/** Endereço da lista com o recorte atual, trocando só a situação. */
function hrefComSituacao(
  filters: HistoricalNfeFilters,
  situacao: HistoricalSituation | null,
) {
  const params = new URLSearchParams();
  if (situacao) params.set("situacao", situacao);
  if (filters.fornecedorId) params.set("fornecedor", filters.fornecedorId);
  if (filters.de) params.set("de", filters.de);
  if (filters.ate) params.set("ate", filters.ate);
  if (filters.busca) params.set("busca", filters.busca);
  const query = params.toString();
  return query ? `${BASE_PATH}?${query}` : BASE_PATH;
}

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function HistoricoFiscalPage({
  searchParams,
}: PageProps<"/recebimentos/historico">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");
  const params = await searchParams;
  const rawPage = Number(
    Array.isArray(params.pagina) ? params.pagina[0] : params.pagina,
  );
  const filters = parseHistoricalNfeFilters(params);
  // Vai junto no link de cada nota, para a volta cair no mesmo recorte.
  const listQuery = historicalListQuery(params);
  const notaHref = (id: string) =>
    listQuery
      ? `${BASE_PATH}/${id}?lista=${encodeURIComponent(listQuery)}`
      : `${BASE_PATH}/${id}`;
  const imports = await listHistoricalNfeImports(
    company.companyId,
    Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    filters,
  );
  const canImport = permissions.has("receipt.post");
  // A situação mora nas abas; o botão conta só o que está escondido nele.
  const filtrosNoBotao = contarHistoricalNfeFilters({
    ...filters,
    situacao: null,
  });
  const filtrando = contarHistoricalNfeFilters(filters) > 0;
  const totalSemSituacao = Object.values(imports.byStatus).reduce(
    (sum, n) => sum + n,
    0,
  );
  const abas: {
    status: HistoricalSituation | null;
    label: string;
    count: number;
    destaque?: boolean;
  }[] = [
    { status: null, label: "Todas", count: totalSemSituacao },
    // Logo depois de "Todas": é a aba que pede ação antes de conciliar — uma
    // nota daqui conciliada no histórico vira compra contada em dobro.
    ...(imports.looksLikeOrderCount > 0 || filters.situacao === LOOKS_LIKE_ORDER
      ? [
          {
            status: LOOKS_LIKE_ORDER as HistoricalSituation,
            label: "Parece pedido",
            count: imports.looksLikeOrderCount,
            destaque: true,
          },
        ]
      : []),
    ...(Object.keys(HISTORICAL_STATUS_LABEL) as HistoricalStatus[])
      .filter(
        (status) => imports.byStatus[status] > 0 || filters.situacao === status,
      )
      .map((status) => ({
        status,
        label: HISTORICAL_STATUS_LABEL[status],
        count: imports.byStatus[status],
      })),
  ];

  return (
    <div className="w-full">
      <PageHeader
        title="Histórico fiscal por NF-e"
        description="Recupere compras antigas preservando a data e o preço efetivamente praticado."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/recebimentos">Voltar aos recebimentos</Link>
          </Button>
        }
      />

      {canImport ? <HistoricalNfeUploadForm /> : null}

      <section className="mt-7">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-fg font-semibold">Notas importadas</h2>
            <p className="text-fg-muted text-sm">
              Rascunhos ainda precisam da associação dos produtos; confirmadas
              já alimentam os históricos.
            </p>
          </div>
          <FilterDialog basePath={BASE_PATH} ativos={filtrosNoBotao}>
            {/* A situação escolhida nas abas viaja junto ao aplicar. */}
            {filters.situacao ? (
              <input type="hidden" name="situacao" value={filters.situacao} />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="busca" className="text-fg-muted text-xs">
                  Nº da nota, chave ou fornecedor
                </label>
                <Input
                  id="busca"
                  name="busca"
                  placeholder="285609, 3526…, Coca cola…"
                  defaultValue={filters.busca ?? ""}
                  className="h-8"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="fornecedor" className="text-fg-muted text-xs">
                  Fornecedor
                </label>
                <SearchableSelect
                  id="fornecedor"
                  name="fornecedor"
                  defaultValue={filters.fornecedorId ?? ""}
                  options={imports.suppliers}
                  placeholder="Digite o fornecedor…"
                  emptyMessage="Nenhum fornecedor encontrado."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="de" className="text-fg-muted text-xs">
                  Emitidas de
                </label>
                <DateTimePicker
                  id="de"
                  name="de"
                  defaultValue={filters.de ?? ""}
                  placeholder="Escolher data inicial"
                  dateOnly
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ate" className="text-fg-muted text-xs">
                  Até
                </label>
                <DateTimePicker
                  id="ate"
                  name="ate"
                  defaultValue={filters.ate ?? ""}
                  placeholder="Escolher data final"
                  dateOnly
                />
              </div>
            </div>
          </FilterDialog>
        </div>

        {/* Situação em abas, e não no modal: é o recorte do dia a dia ("o que
            falta conciliar?"), e a contagem já responde antes do clique. Cada
            aba conta dentro do resto do filtro. */}
        <nav
          aria-label="Situação das notas"
          className="mb-3 flex gap-1.5 overflow-x-auto pb-1"
        >
          {abas.map(({ status, label, count, destaque }) => {
            const ativa = filters.situacao === status;
            return (
              <Link
                key={status ?? "todas"}
                href={hrefComSituacao(filters, status)}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "border-border inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  ativa
                    ? "bg-primary-solid text-primary-solid-fg border-primary-solid"
                    : destaque
                      ? "border-warning/40 bg-warning/5 text-warning hover:bg-warning-soft"
                      : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
                )}
              >
                {label}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    ativa ? "opacity-80" : "text-fg-subtle",
                  )}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {imports.rows.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title={
              filtrando
                ? "Nenhuma nota neste recorte"
                : "Nenhuma NF-e histórica"
            }
            description={
              filtrando
                ? "Nenhuma nota casa com o filtro aplicado. Limpe o recorte para ver todas."
                : "Importe o primeiro XML para recuperar preços e compras anteriores ao sistema."
            }
            action={
              filtrando ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={BASE_PATH}>Limpar filtros</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {/* No celular a linha vira ficha empilhada: seis colunas com nome de
                fornecedor e valor não cabem em 360px sem empurrar a situação
                para fora da tela. A partir de `sm` volta a ser tabela. */}
            <Table className="block sm:table">
              <TableHeader className="hidden sm:table-header-group">
                <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                  <TableHead>NF-e</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead className="hidden md:table-cell">Itens</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block sm:table-row-group">
                {imports.rows.map((item) => (
                  <TableRow
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 p-3 sm:table-row sm:p-0"
                  >
                    <TableCell className="col-span-2 block p-0 whitespace-normal sm:table-cell sm:p-2">
                      <Link
                        href={notaHref(item.id)}
                        className="text-fg font-medium hover:underline"
                      >
                        {item.invoice_number}
                        {item.invoice_series ? `/${item.invoice_series}` : ""}
                      </Link>
                      <span className="text-fg-subtle block truncate text-xs sm:max-w-40">
                        {item.file_name}
                      </span>
                    </TableCell>
                    <TableCell className="text-fg-muted col-span-2 block p-0 whitespace-normal sm:table-cell sm:p-2">
                      {item.supplierName ?? item.issuer_name ?? "A associar"}
                    </TableCell>
                    <TableCell className="text-fg-muted col-span-2 block p-0 text-xs whitespace-normal sm:table-cell sm:p-2 sm:text-sm">
                      <span className="sm:hidden">Emitida em </span>
                      {DATE.format(new Date(item.issued_at))}
                      {/* A contagem de itens só tem coluna própria a partir de
                          `md`; antes disso viaja junto da emissão. */}
                      <span className="md:hidden">
                        {" · "}
                        {item.itemCount}{" "}
                        {item.itemCount === 1 ? "item" : "itens"}
                      </span>
                    </TableCell>
                    <TableCell className="text-fg-muted hidden tabular-nums md:table-cell">
                      {item.itemCount}
                    </TableCell>
                    <TableCell className="text-fg block p-0 font-medium tabular-nums sm:table-cell sm:p-2 sm:font-normal">
                      {MONEY.format(item.invoiceTotal)}
                    </TableCell>
                    <TableCell className="flex flex-wrap justify-end gap-1 justify-self-end p-0 sm:table-cell sm:p-2">
                      {item.suggestedOrderNumbers.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning mr-1"
                          title="Emitida na janela de um pedido sem entrada deste fornecedor"
                        >
                          Pedido #{item.suggestedOrderNumbers[0]}?
                        </Badge>
                      ) : null}
                      <Badge
                        variant={
                          item.status === "posted" ? "default" : "outline"
                        }
                      >
                        {HISTORICAL_STATUS_LABEL[
                          item.status as HistoricalStatus
                        ] ?? item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DataTablePagination
              {...imports.pagination}
              allowPageSize={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}
