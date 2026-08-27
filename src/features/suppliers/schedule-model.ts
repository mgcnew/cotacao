export const PURCHASE_WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

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
