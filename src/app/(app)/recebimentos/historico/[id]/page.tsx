import { Eye } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { HistoricalNfeOrderSuggestion } from "@/components/receipts/historical-nfe-order-suggestion";
import { HistoricalNfeReconciliationForm } from "@/components/receipts/historical-nfe-reconciliation-form";
import { HistoricalNfeTransferForm } from "@/components/receipts/historical-nfe-transfer-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { suggestOrdersForImport } from "@/features/receipts/historical-order-match";
import { getHistoricalNfeImport } from "@/features/receipts/historical-queries";
import {
  historicalListHref,
  historicalListQuery,
} from "@/features/receipts/historical-filters";
import {
  listAttributeDefinitions,
  listCategories,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const DIA_DA_LOJA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function ConciliacaoNfeHistoricaPage({
  params,
  searchParams,
}: PageProps<"/recebimentos/historico/[id]">) {
  const [{ id }, query, company] = await Promise.all([
    params,
    searchParams,
    requireActiveCompany(),
  ]);
  // O recorte da lista de onde a nota foi aberta: "Voltar" e a confirmação
  // devolvem para ele, e não para o começo da lista.
  const rawLista = Array.isArray(query.lista) ? query.lista[0] : query.lista;
  const listQuery = historicalListQuery(
    Object.fromEntries(new URLSearchParams(rawLista ?? "")),
  );
  const backHref = historicalListHref(listQuery);
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");
  const data = await getHistoricalNfeImport(company.companyId, id);
  if (!data) notFound();
  const { history } = data;
  const podeDarEntrada =
    permissions.has("receipt.post") && permissions.has("receipt.create");
  const orderSuggestions = podeDarEntrada
    ? await suggestOrdersForImport(company.companyId, history, data.items)
    : [];
  const productCatalog =
    history.status === "draft" && permissions.has("product.create")
      ? await Promise.all([
          listCategories(company.companyId),
          listUnits(company.companyId),
          listAttributeDefinitions(company.companyId),
        ])
      : null;

  return (
    <div className="w-full">
      <PageHeader
        title={`NF-e ${history.invoice_number}${history.invoice_series ? `/${history.invoice_series}` : ""}`}
        description={`${history.issuer_name ?? "Fornecedor"} · emitida em ${DATE_TIME.format(new Date(history.issued_at))}`}
        action={
          /* Os atalhos de cadastro saíram daqui e foram para dentro do
             formulário, ao lado do campo onde a falta aparece: no celular,
             quatro botões empurravam a nota para baixo da dobra. */
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/recebimentos/historico/${id}/nota`} target="_blank">
                <Eye className="size-3.5" aria-hidden /> Visualizar nota
              </Link>
            </Button>
            {data.downloadUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={data.downloadUrl}>Baixar XML</a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href={backHref}>Voltar</Link>
            </Button>
          </>
        }
      />

      {/* Três dados curtos: no celular cabem dois por linha — empilhá-los custa
          uma tela de rolagem antes de chegar aos itens. */}
      <section className="border-border bg-surface mb-6 grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <p className="text-fg-subtle text-xs">Data histórica</p>
          <p className="text-fg text-sm">
            {DATE_TIME.format(new Date(history.issued_at))}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Total da NF-e</p>
          <p className="text-fg text-sm tabular-nums">
            {MONEY.format(history.invoiceTotal)}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Situação</p>
          <Badge variant={history.status === "posted" ? "default" : "outline"}>
            {history.status === "posted"
              ? "No histórico"
              : history.status === "transferred"
                ? "Em recebimento"
                : "A conciliar"}
          </Badge>
        </div>
      </section>

      {orderSuggestions.length > 0 ? (
        <HistoricalNfeOrderSuggestion
          importId={history.id}
          issuedDay={DIA_DA_LOJA.format(new Date(history.issued_at))}
          posted={history.status === "posted"}
          suggestions={orderSuggestions}
          listQuery={listQuery}
        />
      ) : null}

      {history.status === "posted" ? (
        <div className="border-border bg-surface rounded-xl border p-4 sm:p-5">
          <h2 className="text-fg font-semibold">Importação confirmada</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Os produtos e preços desta nota já aparecem no histórico do
            fornecedor e dos produtos associados.
          </p>
          {/* Com pedido sugerido acima, o caminho manual só aparece se já
              houver chegada aberta para escolher — "registre a chegada
              primeiro" contradiria o botão que faz isso por você. */}
          {permissions.has("receipt.post") &&
          (orderSuggestions.length === 0 ||
            data.eligibleReceipts.length > 0) ? (
            <div className="border-border mt-5 border-t pt-5">
              <h3 className="text-fg text-sm font-medium">
                Esta NF-e pertence a um pedido do sistema?
              </h3>
              <p className="text-fg-muted mt-1 text-xs">
                Transfira para o recebimento para conferir o pedido sem contar a
                mesma compra duas vezes.
              </p>
              {data.eligibleReceipts.length ? (
                <HistoricalNfeTransferForm
                  importId={history.id}
                  receipts={data.eligibleReceipts}
                />
              ) : (
                <div className="bg-surface-sunken mt-3 rounded-lg p-3">
                  <p className="text-fg-muted text-xs">
                    Não há chegada aguardando conferência para este fornecedor.
                    Primeiro registre a chegada do pedido e volte a esta nota.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href="/recebimentos">Ir para recebimentos</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : history.status === "transferred" ? (
        <div className="border-border bg-surface rounded-xl border p-4 sm:p-5">
          <h2 className="text-fg font-semibold">
            NF-e transferida para recebimento
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            Esta nota não é mais contada separadamente no histórico. Os valores
            serão efetivados pela conferência
            {data.transferredReceipt
              ? ` do pedido #${data.transferredReceipt.orderNumber}`
              : " do pedido vinculado"}
            .
          </p>
          {data.transferredReceipt ? (
            <Button asChild size="sm" className="mt-4">
              <Link href={`/recebimentos/${data.transferredReceipt.id}`}>
                Abrir conferência
              </Link>
            </Button>
          ) : null}
        </div>
      ) : permissions.has("receipt.post") ? (
        <HistoricalNfeReconciliationForm
          importId={history.id}
          issuerDocument={history.issuer_document}
          initialIssuerLinked={Boolean(history.supplier_legal_entity_id)}
          initialSupplierId={history.supplier_id ?? ""}
          listQuery={listQuery}
          suppliers={data.suppliers}
          products={data.products}
          items={data.items}
          canCreateProduct={permissions.has("product.create")}
          productFormOptions={
            productCatalog
              ? {
                  categories: productCatalog[0]
                    .filter((category) => category.isActive)
                    .map((category) => ({
                      id: category.id,
                      label: category.name,
                    })),
                  units: productCatalog[1]
                    .filter((unit) => unit.is_active)
                    .map((unit) => ({
                      id: unit.id,
                      label: `${unit.name} (${unit.symbol})`,
                    })),
                  attributes: productCatalog[2]
                    .filter((attribute) => attribute.isActive)
                    .map((attribute) => ({
                      id: attribute.id,
                      categoryId: attribute.categoryId,
                      name: attribute.name,
                      dataType: attribute.dataType,
                      unitSymbol: attribute.unitSymbol,
                      isRequired: attribute.isRequired,
                      isConversionFactor: attribute.isConversionFactor,
                    })),
                }
              : null
          }
        />
      ) : (
        <p className="border-border bg-surface text-fg-muted rounded-xl border p-4 text-sm sm:p-5">
          Seu papel permite visualizar, mas não confirmar esta conciliação.
        </p>
      )}
    </div>
  );
}
