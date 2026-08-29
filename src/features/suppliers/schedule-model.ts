export const PURCHASE_WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

const WEEKDAY_LIST = new Intl.ListFormat("pt-BR", {
  style: "long",
  type: "conjunction",
});

export function formatPurchaseWeekdays(weekdays: number[]) {
  return WEEKDAY_LIST.format(
    weekdays
      .filter((weekday) => weekday >= 0 && weekday <= 6)
      .sort((left, right) => left - right)
      .map((weekday) => PURCHASE_WEEKDAYS[weekday]),
  );
}

export const PURCHASE_INTERVAL_LABEL: Record<number, string> = {
  1: "Toda semana",
  2: "A cada 2 semanas",
  4: "A cada 4 semanas",
};

export type SupplierPurchaseSchedule = {
  id: string;
  supplierId: string;
  supplierName: string;
  categoryId: string | null;
  categoryName: string | null;
  label: string | null;
  /** Todos os dias em que o fornecedor aceita pedidos nesta rotina. */
  weekdays: number[];
  /** Primeiro dia, mantido para compatibilidade com registros antigos. */
  weekday: number;
  preferredTime: string | null;
  intervalWeeks: number;
  anchorDate: string;
  reminderDaysBefore: number;
  expectedDeliveryDays: number | null;
  notes: string | null;
  isActive: boolean;
};

export type PurchaseScheduleAlert = SupplierPurchaseSchedule & {
  occurrenceDate: string;
  daysUntil: number;
  status: "overdue" | "today" | "upcoming";
  templateItemCount: number;
};

export type ScheduleTemplateItem = {
  id: string;
  scheduleId: string;
  productId: string;
  productName: string;
  purchaseUnit: string;
  quantity: string;
  notes: string | null;
  isActive: boolean;
};

export type ScheduleProductOption = {
  id: string;
  name: string;
  purchaseUnit: string;
};
