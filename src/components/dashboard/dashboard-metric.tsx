import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "bad" | "info";

/**
 * Um número do painel, numa faixa baixa: rótulo e explicação à esquerda, valor
 * à direita. Sem o quadrado de ícone — o valor já vem na cor do que significa,
 * e o ícone colorido só somava mais uma mancha ao lado dele.
 */
export function DashboardMetric({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  onClick,
  actionLabel,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const valueClass = {
    neutral: "text-fg",
    good: "text-success",
    bad: "text-destructive",
    info: "text-fg",
  }[tone];

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">{label}</p>
        <p className="text-fg-subtle mt-0.5 text-xs leading-relaxed">{hint}</p>
      </div>
      <p
        className={cn(
          "shrink-0 text-lg font-semibold tracking-tight tabular-nums",
          valueClass,
        )}
      >
        {value}
      </p>
      {href || onClick ? (
        <ChevronRight className="text-fg-subtle size-4 shrink-0" aria-hidden />
      ) : null}
    </>
  );
  const className =
    "border-border bg-surface flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-xs transition-all";
  const interactiveClassName =
    "hover:border-primary-line hover:-translate-y-0.5 hover:shadow-sm focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-3";

  return href ? (
    <Link
      data-slot="dashboard-metric"
      data-tone={tone}
      href={href}
      className={cn(className, interactiveClassName)}
    >
      {content}
    </Link>
  ) : onClick ? (
    <button
      data-slot="dashboard-metric"
      data-tone={tone}
      type="button"
      onClick={onClick}
      className={cn(className, interactiveClassName, "w-full")}
    >
      {content}
      {/* Complementa o nome — rótulo, valor e dica já saem do conteúdo. Um
          `aria-label` aqui o SUBSTITUIA, e o leitor de tela deixava de ouvir o
          valor em R$. */}
      {actionLabel ? <span className="sr-only">. {actionLabel}</span> : null}
    </button>
  ) : (
    <div data-slot="dashboard-metric" data-tone={tone} className={className}>
      {content}
    </div>
  );
}
