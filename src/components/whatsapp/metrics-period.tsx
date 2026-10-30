"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const PERIODS = [7, 30, 90] as const;

/**
 * Seletor do período dos indicadores.
 *
 * Os links montam o endereço a partir do que está na barra AGORA — a conversa
 * aberta e o filtro mudam sem navegar —, e `replace` + `scroll={false}` evitam
 * empilhar histórico a cada troca.
 */
export function MetricsPeriod({ days }: { days: number }) {
  const params = useSearchParams();

  function hrefFor(period: number) {
    const next = new URLSearchParams(params.toString());
    if (period === 30) next.delete("periodo");
    else next.set("periodo", String(period));
    const query = next.toString();
    return query ? `/whatsapp?${query}` : "/whatsapp";
  }

  return (
    <div
      role="group"
      aria-label="Período dos indicadores"
      className="bg-surface-muted flex shrink-0 rounded-lg p-0.5"
    >
      {PERIODS.map((period) => (
        <Link
          key={period}
          href={hrefFor(period)}
          replace
          scroll={false}
          aria-current={days === period ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            days === period
              ? "bg-surface text-fg shadow-xs font-medium"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {period} dias
        </Link>
      ))}
    </div>
  );
}
