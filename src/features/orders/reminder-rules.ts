/** Horário comercial acordado para cobranças: São Paulo, dias úteis, 8h–18h. */
export function isOrderReminderBusinessTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return weekday !== "Sat" && weekday !== "Sun" && hour >= 8 && hour < 18;
}

export function stillAwaitingOrderConfirmation(order: {
  status: string; currentRevisionId: string | null;
}, revision: { id: string; status: string }): boolean {
  return order.status === "awaiting_confirmation" && revision.status === "sent" && order.currentRevisionId === revision.id;
}
