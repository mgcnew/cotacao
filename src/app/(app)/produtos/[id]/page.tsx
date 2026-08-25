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
import { getProduct } from "@/features/products/queries";
import { PRODUCT_PURPOSE_LABEL } from "@/features/products/purposes";
import { requireActiveCompany } from "@/lib/auth/dal";

export default async function ProdutoPage({
  params,
  searchParams,
}: PageProps<"/produtos/[id]">) {
  const [{ id }, query, company] = await Promise.all([
    params,
    searchParams,
    requireActiveCompany(),
  ]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const filters = parseHistoryFilters(query, "fornecedor");
  const [product, history] = await Promise.all([
    getProduct(company.companyId, id),
    getQuotationHistory(company.companyId, { productId: id }, filters),
  ]);

  if (!product) notFound();

  const barcodes = product.product_barcodes.filter((barcode) => barcode.is_active);

  return (
    <div className="w-full">
      <PageHeader
        title={product.name}
        description="Histórico de preços, fornecedores participantes e decisões de compra deste produto."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />

      <section className="border-border bg-surface mb-6 grid gap-4 rounded-xl border p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-fg-subtle text-xs">Categoria</p>
          <p className="text-fg text-sm">{product.categories?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Finalidade</p>
          <p className="text-fg text-sm">
            {PRODUCT_PURPOSE_LABEL[product.purpose] ?? product.purpose}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Unidade de compra</p>
          <p className="text-fg text-sm">{product.purchase_unit?.symbol ?? "—"}</p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Unidade de preço</p>
          <p className="text-fg text-sm">{product.pricing_unit?.symbol ?? "—"}</p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Situação</p>
          <Badge variant={product.is_active ? "default" : "secondary"}>
            {product.is_active ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        {barcodes.length > 0 ? (
          <div className="sm:col-span-2 lg:col-span-5">
            <p className="text-fg-subtle text-xs">Códigos de barras</p>
            <p className="text-fg font-mono text-sm">
              {barcodes.map((barcode) => barcode.code).join(" · ")}
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-fg text-sm font-semibold">Histórico comercial</h2>
          <p className="text-fg-muted mt-1 text-sm">
            O preço riscado é a proposta inicial; o preço principal já considera
            a última negociação. O valor da nota aparece quando houver recebimento.
          </p>
        </div>
        <QuotationHistory
          scope="product"
          {...history}
          filters={filters}
          basePath={`/produtos/${id}`}
        />
      </section>
    </div>
  );
}
