"use client";

import { CalendarPlus, Check, Lightbulb, X } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  acceptDetectedPurchasePattern,
  dismissDetectedPurchasePattern,
  type DetectedPatternState,
} from "@/features/suppliers/schedule-actions";
import {
  PURCHASE_INTERVAL_LABEL,
  PURCHASE_WEEKDAYS,
} from "@/features/suppliers/schedule-model";
import type { DetectedPurchasePattern } from "@/features/suppliers/purchase-patterns";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

function ActionButton({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? "Salvando..." : children}
    </Button>
  );
}

function PatternRow({ pattern }: { pattern: DetectedPurchasePattern }) {
  const [acceptState, acceptAction] = useActionState<
    DetectedPatternState,
    FormData
  >(acceptDetectedPurchasePattern, { error: null });
  const [dismissState, dismissAction] = useActionState<
    DetectedPatternState,
    FormData
  >(dismissDetectedPurchasePattern, { error: null });

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="bg-warning-soft text-warning grid size-9 shrink-0 place-items-center rounded-xl">
            <Lightbulb className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-fg text-sm font-semibold">
                {pattern.supplierName}
              </h3>
              <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-semibold">
                {pattern.confidencePercent}% regular
              </span>
            </div>
            <p className="text-fg-muted mt-1 text-xs">
              {PURCHASE_INTERVAL_LABEL[pattern.intervalWeeks]} · geralmente na{" "}
              {PURCHASE_WEEKDAYS[pattern.weekday].toLowerCase()}
            </p>
            <p className="text-fg-subtle mt-1 text-[11px]">
              Detectado em {pattern.orderCount} datas de compra
              {pattern.historicalNfeCount > 0
                ? `, com ${pattern.historicalNfeCount} NF-e históricas`
                : ""}{" "}
              · próxima ocorrência estimada em{" "}
              {DATE.format(new Date(`${pattern.nextOccurrence}T12:00:00`))}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={acceptAction}>
            <input type="hidden" name="supplierId" value={pattern.supplierId} />
            <ActionButton>
              <Check aria-hidden /> Ativar lembrete
            </ActionButton>
          </form>
          <form action={dismissAction}>
            <input type="hidden" name="supplierId" value={pattern.supplierId} />
            <ActionButton variant="ghost">
              <X aria-hidden /> Ignorar por 30 dias
            </ActionButton>
          </form>
        </div>
      </div>
      {acceptState.error || dismissState.error ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {acceptState.error || dismissState.error}
        </p>
      ) : null}
    </li>
  );
}

export function DetectedPurchasePatterns({
  patterns,
}: {
  patterns: DetectedPurchasePattern[];
}) {
  if (patterns.length === 0) return null;

  return (
    <section
      className="border-border bg-surface mb-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="detected-patterns-title"
    >
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="detected-patterns-title"
            className="text-fg flex items-center gap-2 text-base font-semibold"
          >
            <CalendarPlus className="text-primary size-4" aria-hidden />
            Rotinas que o sistema percebeu
          </h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            O histórico indica um dia e uma frequência consistentes, mas você
            decide se quer o lembrete.
          </p>
        </div>
        <span className="bg-warning-soft text-warning rounded-full px-2.5 py-1 text-xs font-semibold">
          {patterns.length} {patterns.length === 1 ? "padrão" : "padrões"}
        </span>
      </header>
      <ul className="divide-border divide-y">
        {patterns.map((pattern) => (
          <PatternRow key={pattern.supplierId} pattern={pattern} />
        ))}
      </ul>
    </section>
  );
}
