import Link from "next/link";
import { notFound } from "next/navigation";

import { QuotationHistory } from "@/components/history/quotation-history";
import { PurchasePriceHistory } from "@/components/history/purchase-price-history";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SupplierTabs } from "@/components/suppliers/supplier-tabs";
import { DialogBody } from "@/components/ui/dialog";
import {
  getQuotationHistory,
  parseHistoryFilters,
} from "@/features/history/queries";
import { carregarFornecedor } from "@/features/suppliers/central";
import {
  listPurchasePriceHistory,
  parsePurchaseHistoryPage,
} from "@/features/receipts/historical-queries";
import { requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXPLICACAO =
  "Uma mesma rodada pode ter produtos ganhos e não ganhos; por isso o resultado é calculado item a item.";

export default async function HistoricoFornecedorPage({
  params,
  searchParams,
}: PageProps<"/fornecedores/[id]/historico">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <HistoricoFornecedorContent id={id} query={query} />;
}

/**
 * O histórico comercial do fornecedor, na página inteira e no modal da lista.
 *
 * Os filtros continuam apontando para `/fornecedores/<id>/historico`, a mesma
 * rota que o modal intercepta: filtrar troca os dados sem fechar a caixa nem
 * perder a lista montada atrás.
 */
export async function HistoricoFornecedorContent({
  id,
  query,
  emModal = false,
}: {
  id: string;
  query: Record<string, string | string[] | undefined>;
  emModal?: boolean;
}) {
  if (!UUID.test(id)) notFound();

  const company = await requireActiveCompany();
  const filters = parseHistoryFilters(query, "produto");
  const [supplier, history, purchases] = await Promise.all([
    carregarFornecedor(id),
    getQuotationHistory(company.companyId, { supplierId: id }, filters),
    listPurchasePriceHistory(
      company.companyId,
      { supplierId: id },
      filters,
      parsePurchaseHistoryPage(query),
    ),
  ]);

  if (!supplier) notFound();

  const content = (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* No modal a situação já está no cabeçalho, ao lado do nome. */}
        {emModal ? null : (
          <Badge
            variant={supplier.status === "active" ? "default" : "secondary"}
          >
            {STATUS_LABEL[supplier.status] ?? supplier.status}
          </Badge>
        )}
        <p className="text-fg-muted text-sm">{EXPLICACAO}</p>
      </div>

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

  if (emModal) {
    return <DialogBody>{content}</DialogBody>;
  }

  return (
    <div className="w-full">
      <PageHeader
        title={supplier.name}
        description="Produtos efetivamente comprados, preços praticados e participações em cotações."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/fornecedores">Voltar</Link>
          </Button>
        }
      />
      <div className="border-border -mx-4 mb-6 border-b sm:mx-0">
        <SupplierTabs supplierId={id} />
      </div>
      {content}
    </div>
  );
}
