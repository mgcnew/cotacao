import { Eye, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { QuotationHistory } from "@/components/history/quotation-history";
import { PurchasePriceHistory } from "@/components/history/purchase-price-history";
import {
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getQuotationHistory,
  parseHistoryFilters,
} from "@/features/history/queries";
import { carregarFornecedor } from "@/features/suppliers/central";
import {
  listSupplierFiscalDocuments,
  listPurchasePriceHistory,
  parsePurchaseHistoryPage,
} from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

const FISCAL_STATUS_LABEL: Record<string, string> = {
  draft: "A conciliar",
  posted: "No histórico",
  transferred: "Em recebimento",
  "received-draft": "A conferir",
  voided: "Descartada",
};

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXPLICACAO =
  "Uma mesma rodada pode ter produtos ganhos e não ganhos; por isso o resultado é calculado item a item.";

export default async function HistoricoFornecedorPage({
  params,
  searchParams,
}: PageProps<"/fornecedores/[id]/historico">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    // A `key` faz o esqueleto reaparecer a cada filtro: sem ela a tela ficaria
    // parada nos dados antigos até os novos chegarem.
    <Suspense
      key={JSON.stringify(query)}
      fallback={
        <div className="flex flex-col gap-4">
          <MetricsSkeleton count={5} />
          <TableSkeleton rows={6} columns={5} />
        </div>
      }
    >
      <HistoricoFornecedorContent id={id} query={query} />
    </Suspense>
  );
}

/**
 * O histórico comercial do fornecedor — a aba "Histórico comercial".
 *
 * Cabeçalho e abas: `layout.tsx` ao lado. Os filtros apontam para
 * `/fornecedores/<id>/historico` e só trocam os dados.
 */
export async function HistoricoFornecedorContent({
  id,
  query,
}: {
  id: string;
  query: Record<string, string | string[] | undefined>;
}) {
  if (!UUID.test(id)) notFound();

  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  const canViewFiscalDocuments = permissions.has("receipt.view");
  const filters = parseHistoryFilters(query, "produto");
  const [supplier, history, purchases, fiscalDocuments] = await Promise.all([
    carregarFornecedor(id),
    getQuotationHistory(company.companyId, { supplierId: id }, filters),
    listPurchasePriceHistory(
      company.companyId,
      { supplierId: id },
      filters,
      parsePurchaseHistoryPage(query),
    ),
    canViewFiscalDocuments
      ? listSupplierFiscalDocuments(company.companyId, id)
      : Promise.resolve([]),
  ]);

  if (!supplier) notFound();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge
          variant={supplier.status === "active" ? "default" : "secondary"}
        >
          {STATUS_LABEL[supplier.status] ?? supplier.status}
        </Badge>
        <p className="text-fg-muted text-sm">{EXPLICACAO}</p>
      </div>

      {canViewFiscalDocuments ? (
        <section className="border-border bg-surface mb-6 rounded-xl border">
          <div className="border-border flex items-start gap-3 border-b p-4 sm:p-5">
            <FileText
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <div>
              <h2 className="text-fg text-sm font-semibold">
                Documentos fiscais
              </h2>
              <p className="text-fg-muted mt-1 text-xs">
                XMLs vinculados a este fornecedor. A visualização da nota é
                gerada em HTML somente quando solicitada.
              </p>
            </div>
          </div>

          {fiscalDocuments.length ? (
            <div className="divide-border divide-y">
              {fiscalDocuments.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-fg text-sm font-medium">
                        NF-e {document.invoice_number}
                        {document.invoice_series
                          ? `/${document.invoice_series}`
                          : ""}
                      </p>
                      <Badge variant="outline">
                        {FISCAL_STATUS_LABEL[document.status] ??
                          document.status}
                      </Badge>
                    </div>
                    <p className="text-fg-muted mt-1 text-xs">
                      {DATE.format(new Date(document.issued_at))} ·{" "}
                      {MONEY.format(document.invoiceTotal)}
                      {document.issuer_name
                        ? ` · ${document.issuer_name}`
                        : ""}
                    </p>
                    <p className="text-fg-subtle mt-1 truncate font-mono text-xs">
                      Chave {document.access_key}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Link href={document.href} target="_blank">
                      <Eye className="size-3.5" aria-hidden /> Visualizar nota
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-fg-muted p-5 text-sm">
              Nenhuma NF-e vinculada a este fornecedor.
            </p>
          )}
        </section>
      ) : null}

      <PurchasePriceHistory
        scope="supplier"
        rows={purchases.rows}
        pagination={purchases.pagination}
        pricePoints={purchases.pricePoints}
      />

      <QuotationHistory
        scope="supplier"
        {...history}
        options={[
          ...new Map(
            [...history.options, ...purchases.options].map((option) => [
              option.id,
              option,
            ]),
          ).values(),
        ]}
        filters={filters}
        basePath={`/fornecedores/${id}/historico`}
      />
    </>
  );
}
