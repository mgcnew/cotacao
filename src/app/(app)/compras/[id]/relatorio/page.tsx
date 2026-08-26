import { ArrowLeft, FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { RoundReportContent } from "@/components/rounds/round-report";
import { Button } from "@/components/ui/button";
import { getRoundReport } from "@/features/rounds/report";

export default async function QuotationReportPage({
  params,
}: PageProps<"/compras/[id]/relatorio">) {
  const { id } = await params;
  const report = await getRoundReport(id);
  if (!report) notFound();

  return (
    <div className="w-full print:bg-white print:text-black">
      <div className="print:hidden">
        <PageHeader
          title="Relatório da cotação"
          description={`${report.companyName} · ${report.round.title}`}
          action={
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/compras/${id}/alocacao`}>
                  <ArrowLeft className="size-3.5" aria-hidden /> Voltar
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/compras/${id}/relatorio/download`}>
                  <FileDown className="size-3.5" aria-hidden /> Baixar HTML
                </a>
              </Button>
              <PrintReportButton />
            </>
          }
        />
      </div>

      <header className="border-border mb-6 hidden border-b pb-4 print:block">
        <p className="text-sm">{report.companyName}</p>
        <h1 className="text-2xl font-bold">{report.round.title}</h1>
        <p className="text-sm">Relatório de conclusão da cotação</p>
      </header>

      <RoundReportContent report={report} />
    </div>
  );
}
