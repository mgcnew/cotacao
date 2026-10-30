import type { WhatsAppMetrics } from "@/features/whatsapp/queries";

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

/**
 * Os quatro números do período, numa linha.
 *
 * Eram quatro cartões grandes sob a caixa — espaço que a conversa precisa e que
 * os números, consultados de vez em quando, não justificam. Aqui cabem numa
 * faixa; o seletor de período fica ao lado, em `MetricsPeriod`.
 */
export function WhatsAppMetricsStrip({ metrics }: { metrics: WhatsAppMetrics }) {
  const items = [
    { label: "enviadas", value: metrics.sent.toLocaleString("pt-BR") },
    {
      label: "entregues",
      value: metrics.delivered.toLocaleString("pt-BR"),
      note: `${percentage(metrics.delivered, metrics.sent)}%`,
    },
    {
      label: "responderam",
      value: metrics.responded.toLocaleString("pt-BR"),
      note: `${percentage(metrics.responded, metrics.responseOpportunities)}%`,
    },
    { label: "resposta média", value: duration(metrics.averageResponseSeconds) },
  ];

  return (
    <dl
      aria-label="Indicadores do WhatsApp no período"
      className="text-fg-muted flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <dd className="text-fg order-1 font-semibold tabular-nums">
            {item.value}
          </dd>
          <dt className="order-2">
            {item.label}
            {item.note ? (
              <span className="text-fg-subtle tabular-nums"> · {item.note}</span>
            ) : null}
          </dt>
        </div>
      ))}
    </dl>
  );
}
