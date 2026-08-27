export const DEMAND_EVENT_TYPES = [
  { value: "holiday", label: "Feriado" },
  { value: "payday", label: "Data de pagamento" },
  { value: "promotion", label: "Promoção ou campanha" },
  { value: "seasonal", label: "Período sazonal" },
  { value: "other", label: "Outro evento" },
] as const;

export const DEMAND_SCOPES = [
  { value: "all", label: "Todos os produtos" },
  { value: "category", label: "Uma categoria" },
  { value: "product", label: "Um produto" },
] as const;

export const DEMAND_RECURRENCES = [
  { value: "one_time", label: "Não se repete" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
  { value: "yearly", label: "Todo ano" },
] as const;

export type DemandEventType = (typeof DEMAND_EVENT_TYPES)[number]["value"];
export type DemandScope = (typeof DEMAND_SCOPES)[number]["value"];
export type DemandRecurrence = (typeof DEMAND_RECURRENCES)[number]["value"];

export type DemandCalendarEvent = {
  id: string;
  name: string;
  eventType: DemandEventType;
  startDate: string;
  endDate: string;
  recurrence: DemandRecurrence;
  recurrenceUntil: string | null;
  adjustmentPercent: number;
  scope: DemandScope;
  categoryId: string | null;
  categoryName: string | null;
  productId: string | null;
  productName: string | null;
  notes: string | null;
  isActive: boolean;
};

export type DemandCalendarCategory = {
  id: string;
  name: string;
};

export type DemandCalendarProduct = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};
