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
      <div className="border-border bg-surface flex items-center gap-3 rounded-xl border border-dashed px-4 py-6">
        <CheckCircle2 className="text-success size-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="text-fg font-medium">Nada pedindo atenção agora</p>
          <p className="text-fg-muted">
            Sem atrasos, divergências ou pedidos parados. O que estiver em
            andamento aparece nos números abaixo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="border-border bg-surface hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors outline-none focus-visible:ring-3"
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                item.severity === "high"
                  ? "bg-destructive-soft text-destructive"
                  : "bg-surface-muted text-fg-subtle"
              }`}
              aria-hidden
            >
              <AlertTriangle className="size-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="text-fg block text-sm font-medium">
                {item.title}
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
