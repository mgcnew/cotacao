import { CheckCheck, Clock3, MessageCircleReply, Send } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { WhatsAppMetrics } from "@/features/whatsapp/queries";
import { cn } from "@/lib/utils";

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function duration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.round((seconds % 86400) / 3600);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function WhatsAppMetricsPanel({
  metrics,
  days,
  hrefForPeriod,
  className,
}: {
  metrics: WhatsAppMetrics;
  days: number;
  hrefForPeriod: Record<7 | 30 | 90, string>;
  className?: string;
}) {
  const cards = [
    {
      label: "Enviadas",
      value: metrics.sent.toLocaleString("pt-BR"),
      detail: "mensagens que saíram com sucesso",
      icon: Send,
    },
    {
      label: "Entregues",
      value: metrics.delivered.toLocaleString("pt-BR"),
      detail: `${percentage(metrics.delivered, metrics.sent)}% das enviadas`,
      icon: CheckCheck,
    },
    {
      label: "Respondidas",
      value: metrics.responded.toLocaleString("pt-BR"),
      detail: `${percentage(metrics.responded, metrics.responseOpportunities)}% dos contatos com retorno`,
      icon: MessageCircleReply,
    },
    {
      label: "Tempo médio de resposta",
      value: duration(metrics.averageResponseSeconds),
      detail: "do último envio até a primeira resposta",
      icon: Clock3,
    },
  ];

  return (
    <section className={cn("mb-3", className)} aria-labelledby="whatsapp-metrics-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="whatsapp-metrics-title" className="text-fg text-sm font-semibold">Indicadores do WhatsApp</h2>
          <p className="text-fg-subtle text-xs">Desempenho das conversas operacionais nos últimos {days} dias.</p>
        </div>
        <div className="bg-surface-muted flex rounded-lg p-0.5" aria-label="Período dos indicadores">
          {([7, 30, 90] as const).map((period) => (
            <Link
              key={period}
              href={hrefForPeriod[period]}
              aria-current={days === period ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                days === period ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
              )}
            >
              {period} dias
            </Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} size="sm">
            <CardContent className="flex min-w-0 items-start gap-3">
              <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-fg-muted truncate text-xs">{label}</p>
                <p className="text-fg mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-fg-subtle mt-0.5 text-[11px] leading-tight">{detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
