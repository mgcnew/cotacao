import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHistoricalNfeDocumentView } from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QUANTITY = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 6,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "A conciliar",
  posted: "No histórico",
  transferred: "Em recebimento",
  voided: "Descartada",
};

function formatDocument(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return value || "—";
}

function formatAccessKey(value: string) {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function fiscalNumber(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const raw = (value as Record<string, unknown>)[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type FiscalDocumentViewData = {
  history: {
    invoice_number: string;
    invoice_series: string | null;
    issued_at: string;
    issuer_name: string | null;
    issuer_document: string | null;
    recipient_name: string | null;
    recipient_document: string | null;
    access_key: string;
    status: string;
    fiscal_totals: unknown;
    invoiceTotal: number;
  };
  items: {
    id: string;
    line_number: string;
    supplier_code: string | null;
    description: string;
    commercialQuantity: number;
    commercial_unit: string | null;
    commercialUnitPrice: number;
    productTotal: number;
  }[];
  downloadUrl: string | null;
};

export default async function HistoricalNfeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, company] = await Promise.all([params, requireActiveCompany()]);
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const data = await getHistoricalNfeDocumentView(company.companyId, id);
  if (!data) notFound();
  return (
    <NfeDocumentView
      data={data}
      backHref={`/recebimentos/historico/${id}`}
    />
  );
}

export function NfeDocumentView({
  data,
  backHref,
}: {
  data: FiscalDocumentViewData;
  backHref: string;
}) {
  const { history } = data;
  const totals = [
    ["Produtos", fiscalNumber(history.fiscal_totals, "products")],
    ["Frete", fiscalNumber(history.fiscal_totals, "freight")],
    ["Seguro", fiscalNumber(history.fiscal_totals, "insurance")],
    ["Desconto", fiscalNumber(history.fiscal_totals, "discount")],
    ["Outras despesas", fiscalNumber(history.fiscal_totals, "other")],
    ["IPI", fiscalNumber(history.fiscal_totals, "ipi")],
    ["ICMS ST", fiscalNumber(history.fiscal_totals, "icmsSt")],
    ["Tributos estimados", fiscalNumber(history.fiscal_totals, "estimatedTaxes")],
  ] as const;

  return (
    <div data-slot="nfe-document" className="w-full print:bg-white print:text-black">
      <div className="print:hidden">
        <PageHeader
          title={`Nota fiscal ${history.invoice_number}${history.invoice_series ? `/${history.invoice_series}` : ""}`}
          description="Visualização HTML gerada a partir do XML armazenado."
          action={
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={backHref}>
                  <ArrowLeft className="size-3.5" aria-hidden /> Voltar
                </Link>
              </Button>
              {data.downloadUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={data.downloadUrl}>
                    <Download className="size-3.5" aria-hidden /> Baixar XML
                  </a>
                </Button>
              ) : null}
              <PrintReportButton />
            </>
          }
        />
      </div>

      <article className="mx-auto max-w-[210mm] bg-white text-neutral-950 print:max-w-none">
        <header className="border-2 border-neutral-900 p-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start print:flex-row">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase">
                Espelho da NF-e
              </p>
              <h1 className="mt-1 text-xl font-bold">
                Nota fiscal eletrônica nº {history.invoice_number}
              </h1>
              <p className="mt-1 text-xs text-neutral-600">
                Representação visual gerada sob demanda; o XML autorizado é o
                documento fiscal armazenado.
              </p>
            </div>
            <div className="shrink-0 text-left text-xs sm:text-right print:text-right">
              <p>Série: {history.invoice_series ?? "—"}</p>
              <p>Emissão: {DATE_TIME.format(new Date(history.issued_at))}</p>
              <Badge variant="outline" className="mt-2 border-neutral-400 text-neutral-900">
                {STATUS_LABEL[history.status] ?? history.status}
              </Badge>
            </div>
          </div>
        </header>

        <section className="mt-2 grid border-2 border-neutral-900 sm:grid-cols-2 print:grid-cols-2">
          <div className="border-b border-neutral-900 p-3 sm:border-r sm:border-b-0 print:border-r print:border-b-0">
            <p className="text-[10px] font-semibold tracking-wide uppercase">Emitente</p>
            <p className="mt-1 text-sm font-semibold">{history.issuer_name ?? "—"}</p>
            <p className="text-xs">Documento: {formatDocument(history.issuer_document)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-semibold tracking-wide uppercase">Destinatário</p>
            <p className="mt-1 text-sm font-semibold">{history.recipient_name ?? "—"}</p>
            <p className="text-xs">Documento: {formatDocument(history.recipient_document)}</p>
          </div>
        </section>

        <section className="mt-2 border-2 border-neutral-900 p-3">
          <p className="text-[10px] font-semibold tracking-wide uppercase">Chave de acesso</p>
          <p className="mt-1 break-all font-mono text-xs tracking-wide">
            {formatAccessKey(history.access_key)}
          </p>
        </section>

        <section className="mt-2 border-2 border-neutral-900">
          <div className="border-b border-neutral-900 px-3 py-2 text-xs font-semibold uppercase">
            Produtos e serviços
          </div>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[720px] border-collapse text-[11px] print:min-w-0">
              <thead>
                <tr className="border-b border-neutral-900 text-left">
                  <th className="p-2">Item</th>
                  <th className="p-2">Código</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2 text-right">Qtd.</th>
                  <th className="p-2">Un.</th>
                  <th className="p-2 text-right">Valor unit.</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-300 break-inside-avoid last:border-0">
                    <td className="p-2 align-top">{item.line_number}</td>
                    <td className="p-2 align-top">{item.supplier_code ?? "—"}</td>
                    <td className="p-2 align-top font-medium">{item.description}</td>
                    <td className="p-2 text-right align-top tabular-nums">
                      {QUANTITY.format(item.commercialQuantity)}
                    </td>
                    <td className="p-2 align-top">{item.commercial_unit ?? "—"}</td>
                    <td className="p-2 text-right align-top tabular-nums">
                      {MONEY.format(item.commercialUnitPrice)}
                    </td>
                    <td className="p-2 text-right align-top tabular-nums">
                      {MONEY.format(item.productTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-2 border-2 border-neutral-900">
          <div className="border-b border-neutral-900 px-3 py-2 text-xs font-semibold uppercase">
            Totais
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
            {totals.map(([label, value]) => (
              <div key={label} className="border-r border-b border-neutral-300 p-2">
                <p className="text-[10px] uppercase text-neutral-600">{label}</p>
                <p className="text-xs font-medium tabular-nums">{MONEY.format(value)}</p>
              </div>
            ))}
            <div className="col-span-2 border-t-2 border-neutral-900 p-3 text-right sm:col-span-3 lg:col-span-4 print:col-span-4">
              <p className="text-[10px] font-semibold uppercase">Valor total da NF-e</p>
              <p className="text-lg font-bold tabular-nums">{MONEY.format(history.invoiceTotal)}</p>
            </div>
          </div>
        </section>

        <footer className="mt-3 text-center text-[10px] text-neutral-600">
          Documento exibido a partir do XML da NF-e armazenado no sistema.
        </footer>
      </article>
    </div>
  );
}
