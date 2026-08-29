import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  dismissPurchaseSchedule,
  snoozePurchaseSchedule,
} from "@/features/suppliers/schedule-actions";
import {
  formatPurchaseWeekdays,
  type PurchaseScheduleAlert,
} from "@/features/suppliers/schedule-model";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function dueLabel(alert: PurchaseScheduleAlert) {
  if (alert.status === "overdue") {
    const days = Math.abs(alert.daysUntil);
    return `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (alert.status === "today") return "Comprar hoje";
  if (alert.daysUntil === 1) return "Comprar amanhã";
  return `Comprar em ${alert.daysUntil} dias`;
}

export function RecurringPurchases({
  alerts,
  canCreateRound,
  canCreateOrder,
  canManageSchedule,
}: {
  alerts: PurchaseScheduleAlert[];
  canCreateRound: boolean;
  canCreateOrder: boolean;
  canManageSchedule: boolean;
}) {
  if (alerts.length === 0) return null;

  return (
    <section
      className="border-border bg-surface mb-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="purchase-agenda-title"
    >
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="purchase-agenda-title"
            className="text-fg flex items-center gap-2 text-base font-semibold"
          >
            <CalendarClock className="text-primary size-4" aria-hidden />
            Próximas compras recorrentes
          </h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            O lembrete desaparece quando um pedido ou uma cotação deste
            fornecedor é preparado.
          </p>
        </div>
        <span className="bg-primary-soft text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
          {alerts.length} {alerts.length === 1 ? "compra" : "compras"}
        </span>
      </header>

      <ul className="divide-border divide-y">
        {alerts.map((alert) => (
          <li
            key={`${alert.id}-${alert.occurrenceDate}`}
            className="px-4 py-4 sm:px-5"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={
                    alert.status === "overdue"
                      ? "bg-destructive-soft text-destructive grid size-9 shrink-0 place-items-center rounded-xl"
                      : "bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-xl"
                  }
                >
                  {alert.status === "overdue" ? (
                    <Clock3 className="size-4" aria-hidden />
                  ) : (
                    <ShoppingCart className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-fg font-medium">
                      {alert.supplierName}
                    </h3>
                    <span
                      className={
                        alert.status === "overdue"
                          ? "bg-destructive-soft text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          : "bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      }
                    >
                      {dueLabel(alert)}
                    </span>
                  </div>
                  <p className="text-fg-muted mt-0.5 text-sm">
                    {alert.label ||
                      `Compra habitual · ${formatPurchaseWeekdays(alert.weekdays)}`}
                    {alert.categoryName ? ` · ${alert.categoryName}` : ""}
                    {alert.templateItemCount > 0
                      ? ` · ${alert.templateItemCount} ${alert.templateItemCount === 1 ? "produto no modelo" : "produtos no modelo"}`
                      : ""}
                  </p>
                  <p className="text-fg-subtle mt-1 text-xs">
                    Prevista para{" "}
                    {DATE.format(new Date(`${alert.occurrenceDate}T12:00:00`))}
                    {alert.preferredTime
                      ? `, até ${alert.preferredTime.slice(0, 5)}`
                      : ""}
                    {alert.expectedDeliveryDays !== null
                      ? ` · entrega habitual ${alert.expectedDeliveryDays === 0 ? "no mesmo dia" : `em ${alert.expectedDeliveryDays} dia(s)`}`
                      : ""}
                  </p>
                  {alert.notes ? (
                    <p className="text-fg-muted mt-1 text-xs">{alert.notes}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {canCreateOrder ? (
                  <Button asChild size="sm">
                    <Link
                      href={`/pedidos/novo?fornecedor=${alert.supplierId}&agenda=${alert.id}`}
                    >
                      Montar pedido <ChevronRight aria-hidden />
                    </Link>
                  </Button>
                ) : null}
                {canCreateRound ? (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/compras/nova?fornecedor=${alert.supplierId}&agenda=${alert.id}`}
                    >
                      Criar cotação
                    </Link>
                  </Button>
                ) : null}
                {canManageSchedule ? (
                  <>
                    <form action={snoozePurchaseSchedule.bind(null, alert.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        Lembrar amanhã
                      </Button>
                    </form>
                    <form
                      action={dismissPurchaseSchedule.bind(
                        null,
                        alert.id,
                        alert.occurrenceDate,
                      )}
                    >
                      <Button type="submit" size="sm" variant="ghost">
                        <Check aria-hidden /> Ignorar este dia
                      </Button>
                    </form>
                  </>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
