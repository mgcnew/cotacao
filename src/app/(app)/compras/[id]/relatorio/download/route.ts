import { z } from "zod";

import { getRoundReport } from "@/features/rounds/report";
import { renderRoundReportHtml } from "@/features/rounds/report-html";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new Response("Cotação inválida.", { status: 400 });

  const report = await getRoundReport(parsed.data);
  if (!report) return new Response("Relatório não encontrado.", { status: 404 });
  if (report.round.status !== "completed") {
    return new Response("Conclua a cotação antes de exportar o relatório.", {
      status: 409,
    });
  }

  const safeTitle = report.round.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "cotacao";

  return new Response(renderRoundReportHtml(report), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${safeTitle}.html"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
