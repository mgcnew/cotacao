import { FileDown } from "lucide-react";
import { Suspense } from "react";

import { CardSkeleton, SectionTitleSkeleton } from "@/components/layout/page-skeleton";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { RoundReportContent } from "@/components/rounds/round-report";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import { getRoundReport } from "@/features/rounds/report";

export default async function RelatorioEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
      <Conteudo id={id} />
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
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
          <h2 className="text-fg text-sm font-semibold">Relatório gerencial</h2>
          <p className="text-fg-muted text-xs">
            Resultado consolidado da cotação e economia estimada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/compras/${id}/relatorio/download`}>
              <FileDown aria-hidden /> Baixar HTML
            </a>
          </Button>
          <PrintReportButton />
        </div>
      </div>
      <RoundReportContent report={report} />
    </DialogBody>
  );
}
