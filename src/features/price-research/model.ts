export type ResearchPrice = {
  item_id: string; product_id: string; product_name: string; unit_id: string | null; unit: string | null;
  best_price: number | null;
  offers: { supplier_id: string; supplier_name: string; price: number | null; pricing_unit: string; comparable_price: number | null; availability: string }[];
};
export function scheduledDates(startsOn: string, weekdays: number[], from: string, to: string): string[] {
  const result: string[] = [];
  const start = startsOn > from ? startsOn : from;
  const cursor = new Date(`${start}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= to) {
    if (weekdays.includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
export function shiftDate(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function priceVariation(current: number | null, previous: number | null): number | null {
  return current === null || previous === null || previous <= 0 ? null : (current / previous - 1);
}
export function evolutionRows(collections: { id: string; prices: ResearchPrice[] }[]) {
  const rows = new Map<string, { productName: string; unit: string | null; values: Map<string, number | null> }>();
  for (const collection of collections) for (const item of collection.prices) {
    // Uma troca de unidade cria outra linha: nunca calcula variação entre bases diferentes.
    const key = `${item.product_id}:${item.unit_id ?? 'unknown'}`;
    const row = rows.get(key) ?? { productName: item.product_name, unit: item.unit, values: new Map() };
    const existing = row.values.get(collection.id);
    row.values.set(collection.id, item.best_price === null ? existing ?? null : existing === undefined || existing === null ? item.best_price : Math.min(existing, item.best_price));
    rows.set(key, row);
  }
  return [...rows.entries()].sort((a,b) => a[1].productName.localeCompare(b[1].productName));
}
