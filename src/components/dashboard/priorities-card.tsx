import { AttentionList } from "@/components/dashboard/attention-list";
import { PurchaseAlertRow } from "@/components/dashboard/recurring-purchases";
import type { AttentionItem } from "@/features/dashboard/attention";
import type { PurchaseScheduleAlert } from "@/features/suppliers/schedule-model";

/**
 * A resposta à pergunta da manhã: o que eu resolvo hoje.
 *
 * Duas fontes na mesma lista, porque para quem compra são a mesma coisa: as
 * condições que o sistema detecta (pedido atrasado, divergência, fornecedor sem
 * responder) e as compras recorrentes que venceram ou vencem hoje. Uma compra
 * habitual atrasada é tarefa de hoje exatamente como um pedido atrasado — antes
 * ela vivia num bloco à parte, mais acima, e a lista de prioridades ficava
 * incompleta.
 *
 * As compras recorrentes futuras NÃO entram aqui: ainda não são de hoje.
 */
export function PrioritiesCard({
  attention,
  due,
  canCreateRound,
  canCreateOrder,
  canManageSchedule,
}: {
  attention: AttentionItem[];
  /** Compras recorrentes atrasadas ou de hoje. */
  due: PurchaseScheduleAlert[];
  canCreateRound: boolean;
  canCreateOrder: boolean;
  canManageSchedule: boolean;
}) {
  const total = attention.length + due.length;

  return (
    <section
      className="border-border bg-surface mb-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="attention-title"
    >
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <h2 id="attention-title" className="text-fg text-base font-semibold">
          Prioridades de hoje
        </h2>
        {total > 0 ? (
          <span
            className="bg-surface-muted text-fg-muted grid min-w-7 place-items-center rounded-full px-2 text-xs leading-7 font-semibold"
            aria-label={`${total} ${total === 1 ? "pendência" : "pendências"}`}
          >
            {total}
          </span>
        ) : null}
      </header>

      <AttentionList items={attention} hideEmpty={due.length > 0} />

      {due.length > 0 ? (
        <ul
          className={`divide-border divide-y ${attention.length > 0 ? "border-border border-t" : ""}`}
          aria-label="Compras recorrentes de hoje"
        >
          {due.map((alert) => (
            <PurchaseAlertRow
              key={`${alert.id}-${alert.occurrenceDate}`}
              alert={alert}
              canCreateRound={canCreateRound}
              canCreateOrder={canCreateOrder}
              canManageSchedule={canManageSchedule}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
