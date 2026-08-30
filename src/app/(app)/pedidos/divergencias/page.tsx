import { ArrowLeft, CheckCircle2, ReceiptText, Scale } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { RouteModal } from "@/components/layout/route-modal";
import { ResolveDivergenceForm } from "@/components/orders/divergence-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import { listPendingCommercialDivergences } from "@/features/orders/commercial-divergences";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function CommercialDivergencesPage() {
  return <CommercialDivergencesContent />;
}

export async function CommercialDivergencesContent({
  emModal = false,
}: {
  emModal?: boolean;
}) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (
    !permissions.has("order.view") ||
    !permissions.has("commercial_divergence.view")
  ) {
    redirect("/dashboard");
  }

  const rows = await listPendingCommercialDivergences(company.companyId);
  const canManage = permissions.has("commercial_divergence.manage");
  const exposure = rows.reduce(
    (sum, row) => sum + Math.max(row.financialImpact, 0),
    0,
  );
  const disputes = rows.filter((row) => row.status === "to_dispute").length;

  const content = (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Metric
          label="A decidir"
          value={String(rows.length - disputes)}
          hint="aguardando sua primeira decisão"
          tone={rows.length - disputes > 0 ? "bad" : "neutral"}
        />
        <Metric
          label="Em contestação"
          value={String(disputes)}
          hint="aguardando retorno do fornecedor"
        />
        <div className="col-span-2 sm:col-span-1 [&_[data-slot=metric]]:h-full">
          <Metric
            label="Acréscimo exposto"
            value={MONEY.format(exposure)}
            hint="soma dos impactos ainda abertos"
            tone={exposure > 0 ? "bad" : "neutral"}
          />
        </div>
      </div>

      <div className="border-border bg-surface-sunken mb-5 grid gap-3 rounded-xl border p-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-success font-medium">Preço menor que o pedido</p>
          <p className="text-fg-muted mt-1 text-xs leading-relaxed">
            É ganho para a empresa. O sistema reconhece automaticamente e
            preserva a diferença apenas no histórico financeiro.
          </p>
        </div>
        <div>
          <p className="text-destructive font-medium">
            Preço maior que o pedido
          </p>
          <p className="text-fg-muted mt-1 text-xs leading-relaxed">
            Conteste para acompanhar a cobrança, aceite com justificativa ou
            encerre depois de receber correção, crédito ou estorno.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhuma divergência pedindo decisão"
          description="Os recebimentos estão de acordo ou todas as diferenças já foram tratadas."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/pedidos">Voltar aos pedidos</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-border bg-surface rounded-xl border p-4 shadow-xs"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-fg font-semibold">{row.productName}</p>
                    <Badge
                      variant={
                        row.status === "to_dispute" ? "destructive" : "outline"
                      }
                    >
                      {row.status === "to_dispute"
                        ? "Em contestação"
                        : "A decidir"}
                    </Badge>
                  </div>
                  <p className="text-fg-muted mt-1 text-xs">
                    {row.supplierName}
                    {row.orderNumber ? ` · Pedido #${row.orderNumber}` : ""}
                    {row.invoiceNumber ? ` · NF ${row.invoiceNumber}` : ""}
                    {` · ${DATE.format(new Date(row.createdAt))}`}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p
                    className={
                      row.financialImpact > 0
                        ? "text-destructive text-lg font-semibold tabular-nums"
                        : "text-success text-lg font-semibold tabular-nums"
                    }
                  >
                    {MONEY.format(row.financialImpact)}
                  </p>
                  <p className="text-fg-subtle text-[11px]">impacto total</p>
                </div>
              </div>

              <dl className="border-border mt-3 grid grid-cols-3 divide-x rounded-lg border py-2 text-center">
                <div className="min-w-0 px-2">
                  <dt className="text-fg-subtle text-[11px]">Combinado</dt>
                  <dd className="text-fg mt-0.5 truncate text-xs font-semibold tabular-nums">
                    {row.agreedPrice === null
                      ? "—"
                      : MONEY.format(row.agreedPrice)}
                  </dd>
                </div>
                <div className="border-border min-w-0 px-2">
                  <dt className="text-fg-subtle text-[11px]">Na nota</dt>
                  <dd className="text-fg mt-0.5 truncate text-xs font-semibold tabular-nums">
                    {row.practicedPrice === null
                      ? "—"
                      : MONEY.format(row.practicedPrice)}
                  </dd>
                </div>
                <div className="border-border min-w-0 px-2">
                  <dt className="text-fg-subtle text-[11px]">Quantidade</dt>
                  <dd className="text-fg mt-0.5 truncate text-xs font-semibold tabular-nums">
                    {row.quantity === null
                      ? "—"
                      : row.quantity.toLocaleString("pt-BR")}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="xs" variant="outline">
                    <Link href={`/pedidos/${row.orderId}#divergencias-preco`}>
                      <Scale aria-hidden /> Ver pedido
                    </Link>
                  </Button>
                  {row.receiptId ? (
                    <Button asChild size="xs" variant="outline">
                      <Link href={`/recebimentos/${row.receiptId}`}>
                        <ReceiptText aria-hidden /> Ver recebimento
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {canManage ? (
                  <ResolveDivergenceForm
                    divergenceId={row.id}
                    orderId={row.orderId}
                    commercial
                    financialImpact={row.financialImpact}
                    commercialStatus={row.status}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const description =
    "Decida o que fazer quando a nota ou a mercadoria vier diferente do pedido. Cada decisão fica registrada no histórico.";

  if (emModal) {
    return (
      <RouteModal
        size="xl"
        titulo="Divergências do recebimento"
        descricao={description}
        acao={
          <Badge variant={rows.length ? "destructive" : "secondary"}>
            {rows.length} {rows.length === 1 ? "pendência" : "pendências"}
          </Badge>
        }
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
        title="Divergências do recebimento"
        description={description}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/pedidos">
              <ArrowLeft aria-hidden /> Pedidos
            </Link>
          </Button>
        }
      />
      {content}
    </div>
  );
}
