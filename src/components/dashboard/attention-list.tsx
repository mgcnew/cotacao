import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import type { AttentionItem } from "@/features/dashboard/attention";

/**
 * A lista de pendências, na ordem em que pedem atenção.
 *
 * Cada linha é um link inteiro, e não um texto com um botão ao lado: o alvo de
 * toque no celular passa a ser a linha toda. O verbo fica visível à direita
 * porque saber que existe uma pendência não adianta sem saber o que fazer com
 * ela — é o que o documento mestre pede em 13.2.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-8">
        <span className="bg-success-soft text-success grid size-10 shrink-0 place-items-center rounded-xl">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="text-fg font-medium">Nada pedindo atenção agora</p>
          <p className="text-fg-muted">
            Sem atrasos, divergências ou processos parados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-ring/40 flex items-center gap-3 px-4 py-3.5 transition-colors outline-none focus-visible:ring-3 sm:px-5"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                item.severity === "high"
                  ? "bg-destructive-soft text-destructive"
                  : "bg-surface-muted text-fg-subtle"
              }`}
              aria-hidden
            >
              <AlertTriangle className="size-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-fg block text-sm font-medium">{item.title}</span>
                {item.severity === "high" ? (
                  <span className="bg-destructive-soft text-destructive rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase">Urgente</span>
                ) : null}
              </span>
              <span className="text-fg-muted block text-xs">{item.hint}</span>
            </span>

            <span className="text-fg-muted flex shrink-0 items-center gap-1 text-xs font-medium">
              <span className="hidden sm:inline">{item.actionLabel}</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
