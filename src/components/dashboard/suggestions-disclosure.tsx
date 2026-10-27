import { ChevronRight } from "lucide-react";

import { DetectedPurchasePatterns } from "@/components/dashboard/detected-purchase-patterns";
import { HistoricalReplenishments } from "@/components/dashboard/historical-replenishments";
import { RecurringPurchases } from "@/components/dashboard/recurring-purchases";
import type { PurchaseScheduleAlert } from "@/features/suppliers/schedule-model";

type Replenishments = Parameters<
  typeof HistoricalReplenishments
>[0]["suggestions"];
type Patterns = Parameters<typeof DetectedPurchasePatterns>[0]["patterns"];

function count(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * O que o sistema sugere, fora do caminho de quem veio resolver o dia.
 *
 * Próximas compras recorrentes, reposição pelo histórico e rotinas percebidas
 * são planejamento: ajudam a comprar melhor, mas ninguém precisa delas para
 * fechar a manhã. Ficam recolhidas, com uma linha dizendo o que há dentro —
 * quem quer, abre; quem não quer, não rola por elas até chegar no que importa.
 *
 * É um `<details>` nativo: abre por teclado e leitor de tela sem JavaScript.
 */
export function SuggestionsDisclosure({
  upcoming,
  replenishments,
  patterns,
  canCreateRound,
  canCreateOrder,
  canManageSchedule,
}: {
  upcoming: PurchaseScheduleAlert[];
  replenishments: Replenishments;
  patterns: Patterns;
  canCreateRound: boolean;
  canCreateOrder: boolean;
  canManageSchedule: boolean;
}) {
  const parts = [
    upcoming.length
      ? count(upcoming.length, "compra recorrente", "compras recorrentes")
      : null,
    replenishments.length
      ? count(replenishments.length, "reposição", "reposições")
      : null,
    patterns.length ? count(patterns.length, "rotina", "rotinas") : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <details id="assistente-compras" className="group mt-6 scroll-mt-20">
      <summary className="hover:bg-surface-sunken focus-visible:ring-ring/40 -mx-2 flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-2 py-2 outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-fg-muted size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="text-fg text-base font-semibold">
          Sugestões do sistema
        </span>
        <span className="text-fg-muted text-sm">{parts.join(" · ")}</span>
      </summary>
      <div className="mt-3">
        <RecurringPurchases
          alerts={upcoming}
          canCreateRound={canCreateRound}
          canCreateOrder={canCreateOrder}
          canManageSchedule={canManageSchedule}
        />
        <HistoricalReplenishments suggestions={replenishments} />
        <DetectedPurchasePatterns patterns={patterns} />
      </div>
    </details>
  );
}
