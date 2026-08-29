import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ReceiptConferenceForm } from "@/components/receipts/conference-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReceiptConference } from "@/features/receipts/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ConferenciaPage({
  params,
}: PageProps<"/recebimentos/[id]">) {
  const { id } = await params;
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const data = await getReceiptConference(company.companyId, id);
  if (!data) notFound();
  const { receipt, order, revision } = data;

  return (
    <div className="w-full">
      <PageHeader
        title={`Conferência do pedido #${order.order_number}`}
        description={`${order.suppliers.name} · chegada ${receipt.receivedAt ? DATE_TIME.format(new Date(receipt.receivedAt)) : "registrada"}`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/recebimentos">Voltar</Link>
            </Button>
            <Badge
              variant={receipt.status === "posted" ? "default" : "outline"}
            >
              {receipt.status === "posted" ? "Conferido" : "A conferir"}
            </Badge>
          </>
        }
      />

      {receipt.status === "posted" ? (
        <section className="border-border bg-surface rounded-xl border p-5">
          <h2 className="text-fg font-semibold">Conferência finalizada</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Quantidades e valores desta entrega já foram efetivados no pedido.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href={`/pedidos/${order.id}`}>Ver pedido</Link>
          </Button>
          {receipt.documents.length ? (
            <div className="border-border mt-4 border-t pt-4">
              <p className="text-fg mb-2 text-sm font-medium">XML da NF-e</p>
              <div className="flex flex-wrap gap-2">
                {receipt.documents.map((document) =>
                  document.downloadUrl ? (
                    <Button
                      key={document.id}
                      asChild
                      size="sm"
                      variant="outline"
                    >
                      <a href={document.downloadUrl}>
                        Baixar {document.fileName}
                      </a>
                    </Button>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : !revision ? (
        <p className="text-destructive text-sm">
          O pedido não possui revisão vigente para conferir.
        </p>
      ) : permissions.has("receipt.post") ? (
        <ReceiptConferenceForm
          receiptId={receipt.id}
          orderId={order.id}
          items={revision.items.filter((item) => item.pendingQuantity > 0)}
          invoiceNumber={receipt.invoiceNumber}
          invoiceSeries={receipt.invoiceSeries}
          invoiceTotal={receipt.invoiceTotal}
          notes={receipt.notes}
          companyDocument={data.companyDocument}
          supplierDocument={data.supplierDocument}
          existingDocuments={receipt.documents}
        />
      ) : (
        <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border p-4 text-sm">
          A mercadoria chegou, mas seu papel não permite finalizar a
          conferência.
        </p>
      )}
    </div>
  );
}
