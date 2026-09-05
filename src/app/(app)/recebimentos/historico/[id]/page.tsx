import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { HistoricalNfeReconciliationForm } from "@/components/receipts/historical-nfe-reconciliation-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHistoricalNfeImport } from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function ConciliacaoNfeHistoricaPage({
  params,
}: PageProps<"/recebimentos/historico/[id]">) {
  const [{ id }, company] = await Promise.all([params, requireActiveCompany()]);
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");
  const data = await getHistoricalNfeImport(company.companyId, id);
  if (!data) notFound();
  const { history } = data;

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
            {data.downloadUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={data.downloadUrl}>Baixar XML</a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href="/recebimentos/historico">Voltar</Link>
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
            {history.status === "posted" ? "No histórico" : "A conciliar"}
          </Badge>
        </div>
      </section>

      {history.status === "posted" ? (
        <div className="border-border bg-surface rounded-xl border p-4 sm:p-5">
          <h2 className="text-fg font-semibold">Importação confirmada</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Os produtos e preços desta nota já aparecem no histórico do
            fornecedor e dos produtos associados.
          </p>
        </div>
      ) : permissions.has("receipt.post") ? (
        <HistoricalNfeReconciliationForm
          importId={history.id}
          issuerDocument={history.issuer_document}
          initialIssuerLinked={Boolean(history.supplier_legal_entity_id)}
          initialSupplierId={history.supplier_id ?? ""}
          suppliers={data.suppliers}
          products={data.products}
          items={data.items}
        />
      ) : (
        <p className="border-border bg-surface text-fg-muted rounded-xl border p-4 text-sm sm:p-5">
          Seu papel permite visualizar, mas não confirmar esta conciliação.
        </p>
      )}
    </div>
  );
}
