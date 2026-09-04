import { FileClock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HistoricalNfeUploadForm } from "@/components/receipts/historical-nfe-upload-form";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
import { listHistoricalNfeImports } from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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
  const imports = await listHistoricalNfeImports(
    company.companyId,
    Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  );
  const canImport = permissions.has("receipt.post");

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
        <div className="mb-3">
          <h2 className="text-fg font-semibold">Notas importadas</h2>
          <p className="text-fg-muted text-sm">
            Rascunhos ainda precisam da associação dos produtos; confirmadas já
            alimentam os históricos.
          </p>
        </div>
        {imports.rows.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title="Nenhuma NF-e histórica"
            description="Importe o primeiro XML para recuperar preços e compras anteriores ao sistema."
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
                        href={`/recebimentos/historico/${item.id}`}
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
                    <TableCell className="block justify-self-end p-0 sm:table-cell sm:p-2">
                      <Badge
                        variant={
                          item.status === "posted" ? "default" : "outline"
                        }
                      >
                        {item.status === "posted"
                          ? "No histórico"
                          : "Conciliar"}
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
