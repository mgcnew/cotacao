import Link from "next/link";
import { notFound } from "next/navigation";

import { QuotationHistory } from "@/components/history/quotation-history";
import { PurchasePriceHistory } from "@/components/history/purchase-price-history";
import { PageHeader } from "@/components/layout/page-header";
import { RouteModal } from "@/components/layout/route-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import {
  getQuotationHistory,
  parseHistoryFilters,
} from "@/features/history/queries";
import { getProduct } from "@/features/products/queries";
import { PRODUCT_PURPOSE_LABEL } from "@/features/products/purposes";
import {
  listPurchasePriceHistory,
  parsePurchaseHistoryPage,
} from "@/features/receipts/historical-queries";
import { requireActiveCompany } from "@/lib/auth/dal";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESCRICAO =
  "Histórico de preços, fornecedores participantes e decisões de compra deste produto.";

export default async function ProdutoPage({
  params,
  searchParams,
}: PageProps<"/produtos/historico/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ProdutoContent id={id} query={query} />;
}

/**
 * O histórico do produto, servindo à página inteira e ao modal da lista.
 *
 * Os filtros continuam apontando para `/produtos/historico/<id>`, a mesma rota
 * que o modal intercepta: filtrar por período ou fornecedor troca os dados sem
 * fechar a caixa, e o catálogo segue montado atrás com sua página e rolagem.
 */
export async function ProdutoContent({
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
  const filters = parseHistoryFilters(query, "fornecedor");
  const [product, history, purchases] = await Promise.all([
    getProduct(company.companyId, id),
    getQuotationHistory(company.companyId, { productId: id }, filters),
    listPurchasePriceHistory(
      company.companyId,
      { productId: id },
      filters,
      parsePurchaseHistoryPage(query),
    ),
  ]);

  if (!product) notFound();

  const barcodes = product.product_barcodes.filter(
    (barcode) => barcode.is_active,
  );

  const situacao = (
    <Badge variant={product.is_active ? "default" : "secondary"}>
      {product.is_active ? "Ativo" : "Inativo"}
    </Badge>
  );

  const content = (
    <>
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
          <p className="text-fg text-sm">
            {product.purchase_unit?.symbol ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Unidade de preço</p>
          <p className="text-fg text-sm">
            {product.pricing_unit?.symbol ?? "—"}
          </p>
        </div>
        {/* No modal a situação já está no cabeçalho, ao lado do nome. */}
        {emModal ? null : (
          <div>
            <p className="text-fg-subtle text-xs">Situação</p>
            {situacao}
          </div>
        )}
        {barcodes.length > 0 ? (
          <div className="sm:col-span-2 lg:col-span-5">
            <p className="text-fg-subtle text-xs">Códigos de barras</p>
            <p className="text-fg font-mono text-sm">
              {barcodes.map((barcode) => barcode.code).join(" · ")}
            </p>
          </div>
        ) : null}
      </section>

      <PurchasePriceHistory
        scope="product"
        rows={purchases.rows}
        pagination={purchases.pagination}
        pricePoints={purchases.pricePoints}
      />

      <section>
        <div className="mb-3">
          <h2 className="text-fg text-sm font-semibold">Histórico comercial</h2>
          <p className="text-fg-muted mt-1 text-sm">
            O preço riscado é a proposta inicial; o preço principal já considera
            a última negociação. O valor da nota aparece quando houver
            recebimento.
          </p>
        </div>
        <QuotationHistory
          scope="product"
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
          basePath={`/produtos/historico/${id}`}
        />
      </section>
    </>
  );

  if (emModal) {
    return (
      <RouteModal
        size="xl"
        titulo={product.name}
        descricao={DESCRICAO}
        acao={situacao}
      >
        <DialogBody className="min-h-0 overflow-y-auto">
          <div className="w-full">{content}</div>
        </DialogBody>
      </RouteModal>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title={product.name}
        description={DESCRICAO}
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />
      {content}
    </div>
  );
}
