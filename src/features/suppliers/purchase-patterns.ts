import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DetectedPurchasePattern = {
  supplierId: string;
  supplierName: string;
  weekday: number;
  intervalWeeks: 1 | 2 | 4;
  anchorDate: string;
  nextOccurrence: string;
  orderCount: number;
  confidencePercent: number;
};

type OrderRow = {
  supplier_id: string;
  created_at: string;
  suppliers: { name: string; status: string } | null;
};

const DAY_MS = 86_400_000;

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(later: string, earlier: string) {
  return Math.round(
    (utcDate(later).getTime() - utcDate(earlier).getTime()) / DAY_MS,
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cadenceFor(days: number): 1 | 2 | 4 | null {
  if (days >= 4 && days <= 10) return 1;
  if (days >= 11 && days <= 19) return 2;
  if (days >= 23 && days <= 35) return 4;
  return null;
}

export async function listDetectedPurchasePatterns(
  companyId: string,
): Promise<DetectedPurchasePattern[]> {
  const supabase = await createServerSupabaseClient();
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (companyError) {
    throw new Error(`Falha ao ler o fuso dos padrões: ${companyError.message}`);
  }

  const timezone = company.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  const historyStart = new Date();
  historyStart.setUTCDate(historyStart.getUTCDate() - 120);

  const [ordersResult, schedulesResult, decisionsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("supplier_id, created_at, suppliers!inner(name, status)")
      .eq("company_id", companyId)
      .neq("status", "cancelled")
      .gte("created_at", historyStart.toISOString())
      .order("created_at"),
    supabase
      .from("supplier_purchase_schedules")
      .select("supplier_id")
      .eq("company_id", companyId),
    supabase
      .from("supplier_purchase_pattern_decisions")
      .select("supplier_id, dismissed_until")
      .eq("company_id", companyId)
      .gte("dismissed_until", today),
  ]);

  if (ordersResult.error) {
    throw new Error(
      `Falha ao analisar pedidos recorrentes: ${ordersResult.error.message}`,
    );
  }
  if (schedulesResult.error) {
    throw new Error(
      `Falha ao conferir agendas existentes: ${schedulesResult.error.message}`,
    );
  }
  if (decisionsResult.error) {
    throw new Error(
      `Falha ao conferir padrões dispensados: ${decisionsResult.error.message}`,
    );
  }

  const unavailable = new Set([
    ...(schedulesResult.data ?? []).map((row) => row.supplier_id),
    ...(decisionsResult.data ?? []).map((row) => row.supplier_id),
  ]);
  const bySupplier = new Map<string, OrderRow[]>();
  for (const row of (ordersResult.data ?? []) as unknown as OrderRow[]) {
    if (unavailable.has(row.supplier_id) || row.suppliers?.status !== "active")
      continue;
    const current = bySupplier.get(row.supplier_id) ?? [];
    current.push(row);
    bySupplier.set(row.supplier_id, current);
  }

  const localDate = (instant: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(instant),
    );
  const patterns: DetectedPurchasePattern[] = [];

  for (const [supplierId, rows] of bySupplier) {
    const dates = [
      ...new Set(rows.map((row) => localDate(row.created_at))),
    ].sort();
    if (dates.length < 3) continue;

    const intervals = dates
      .slice(1)
      .map((date, index) => diffDays(date, dates[index]));
    const intervalWeeks = cadenceFor(median(intervals));
    if (!intervalWeeks) continue;

    const targetDays = intervalWeeks * 7;
    const intervalConfidence =
      intervals.filter((days) => Math.abs(days - targetDays) <= 4).length /
      intervals.length;
    const weekdayCounts = new Map<number, number>();
    for (const date of dates) {
      const weekday = utcDate(date).getUTCDay();
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    }
    const [weekday, weekdayCount] = [...weekdayCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    const weekdayConfidence = weekdayCount / dates.length;
    const confidence = Math.min(intervalConfidence, weekdayConfidence);
    if (confidence < 0.6) continue;

    const anchorDate = [...dates]
      .reverse()
      .find((date) => utcDate(date).getUTCDay() === weekday)!;
    let nextOccurrence = anchorDate;
    do {
      nextOccurrence = addDays(nextOccurrence, targetDays);
    } while (nextOccurrence <= today);

    patterns.push({
      supplierId,
      supplierName: rows[0].suppliers?.name ?? "Fornecedor",
      weekday,
      intervalWeeks,
      anchorDate,
      nextOccurrence,
      orderCount: dates.length,
      confidencePercent: Math.round(confidence * 100),
    });
  }

  return patterns
    .sort(
      (a, b) =>
        b.confidencePercent - a.confidencePercent ||
        b.orderCount - a.orderCount,
    )
    .slice(0, 6);
}
