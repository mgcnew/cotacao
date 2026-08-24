export const SUPPLIER_NOTICE_KINDS = [
  "credit",
  "agreement",
  "alert",
  "note",
] as const;

export type SupplierNoticeKind = (typeof SUPPLIER_NOTICE_KINDS)[number];

export const SUPPLIER_NOTICE_KIND_LABEL: Record<SupplierNoticeKind, string> = {
  credit: "Crédito",
  agreement: "Combinado",
  alert: "Aviso",
  note: "Observação",
};

export const SUPPLIER_NOTICE_PRIORITIES = ["normal", "high"] as const;
export type SupplierNoticePriority =
  (typeof SUPPLIER_NOTICE_PRIORITIES)[number];

export function formatSupplierNoticeDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(`${value}T12:00:00`),
  );
}

export function isSupplierNoticeOverdue(
  dueDate: string | null,
  today = new Date(),
): boolean {
  if (!dueDate) return false;
  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return dueDate < localToday;
}
