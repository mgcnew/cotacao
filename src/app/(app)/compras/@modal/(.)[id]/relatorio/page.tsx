import { FileDown } from "lucide-react";
import { Suspense } from "react";

import {
  CardSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { RoundReportContent } from "@/components/rounds/round-report";
import { RoundReportSimpleContent } from "@/components/rounds/round-report-simple";
import { ReportViewToggle } from "@/components/rounds/report-view-toggle";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import { getRoundReport } from "@/features/rounds/report";

export default async function RelatorioEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string | string[] }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const simple = tipo === "simples";

  return (
    <Suspense
      fallback={
        <DialogBody className="space-y-3">
          <SectionTitleSkeleton lines={2} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
          </div>
        </DialogBody>
      }
    >
      <Conteudo id={id} simple={simple} />
    </Suspense>
  );
}

async function Conteudo({ id, simple }: { id: string; simple: boolean }) {
  const report = await getRoundReport(id);

  if (!report) {
    return (
      <DialogBody>
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Não foi possível gerar o relatório desta cotação.
        </p>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      <div className="border-border mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3 print:hidden">
        <div>
          <h2 className="text-fg text-sm font-semibold">
            {simple ? "Relatório simples" : "Relatório completo"}
          </h2>
          <p className="text-fg-muted text-xs">
            {simple
              ? "Resumo dos produtos e da economia prevista e realizada."
              : "Resultado da conclusão e posição atual das conferências."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReportViewToggle roundId={id} simple={simple} />
          <Button asChild size="sm" variant="outline">
            <a
              href={`/compras/${id}/relatorio/download${simple ? "?tipo=simples" : ""}`}
            >
              <FileDown aria-hidden /> Baixar HTML
            </a>
          </Button>
          <PrintReportButton />
        </div>
      </div>
      {simple ? (
        <RoundReportSimpleContent report={report} />
      ) : (
        <RoundReportContent report={report} />
      )}
    </DialogBody>
  );
}
