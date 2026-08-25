import Link from "next/link";
import { notFound } from "next/navigation";

import { QuotationHistory } from "@/components/history/quotation-history";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getQuotationHistory,
  parseHistoryFilters,
} from "@/features/history/queries";
import { getSupplier } from "@/features/suppliers/queries";
import { requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

export default async function HistoricoFornecedorPage({
  params,
  searchParams,
}: PageProps<"/fornecedores/[id]/historico">) {
  const [{ id }, query, company] = await Promise.all([
    params,
    searchParams,
    requireActiveCompany(),
  ]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const filters = parseHistoryFilters(query, "produto");
  const [supplier, history] = await Promise.all([
    getSupplier(company.companyId, id),
    getQuotationHistory(company.companyId, { supplierId: id }, filters),
  ]);

  if (!supplier) notFound();

  return (
    <div className="w-full">
      <PageHeader
        title={`Histórico de ${supplier.name}`}
        description="Participações por item: respostas, preços, decisões ganhas ou perdidas e pedidos gerados."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href={`/fornecedores/${id}`}>Voltar ao fornecedor</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={supplier.status === "active" ? "default" : "secondary"}>
          {STATUS_LABEL[supplier.status] ?? supplier.status}
        </Badge>
        <p className="text-fg-muted text-sm">
          Uma mesma rodada pode ter produtos ganhos e não ganhos; por isso o
          resultado é calculado item a item.
        </p>
      </div>

      <QuotationHistory
        scope="supplier"
        {...history}
        filters={filters}
        basePath={`/fornecedores/${id}/historico`}
      />
    </div>
  );
}
