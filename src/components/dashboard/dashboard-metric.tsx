import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "bad" | "info";

export function DashboardMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
  href?: string;
}) {
  const iconClass = {
    neutral: "bg-surface-muted text-fg-muted",
    good: "bg-success-soft text-success",
    bad: "bg-destructive-soft text-destructive",
    info: "bg-info-soft text-info",
  }[tone];
  const valueClass = {
    neutral: "text-fg",
    good: "text-success",
    bad: "text-destructive",
    info: "text-fg",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-9 place-items-center rounded-xl", iconClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
        {href ? <ArrowUpRight className="text-fg-subtle size-4" aria-hidden /> : null}
      </div>
      <div className="mt-4">
        <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
        <p className="text-fg mt-1 text-sm font-medium">{label}</p>
        <p className="text-fg-subtle mt-0.5 text-xs leading-relaxed">{hint}</p>
      </div>
    </>
  );
  const className = "border-border bg-surface min-w-0 rounded-2xl border p-4 shadow-xs transition-all";

  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:border-primary-line hover:-translate-y-0.5 hover:shadow-sm focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-3",
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
