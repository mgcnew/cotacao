import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type PurchaseScheduleAlert,
  type ScheduleProductOption,
  type ScheduleTemplateItem,
  type SupplierPurchaseSchedule,
} from "@/features/suppliers/schedule-model";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ScheduleRow = {
  id: string;
  supplier_id: string;
  category_id: string | null;
  label: string | null;
  weekday: number;
  preferred_time: string | null;
  interval_weeks: number;
  anchor_date: string;
  reminder_days_before: number;
  expected_delivery_days: number | null;
  notes: string | null;
  is_active: boolean;
  snoozed_until: string | null;
  last_dismissed_occurrence: string | null;
  suppliers: { name: string; status: string } | null;
  categories: { name: string } | null;
};

const SCHEDULE_SELECT = `
  id,
  supplier_id,
  category_id,
  label,
  weekday,
  preferred_time,
  interval_weeks,
  anchor_date,
  reminder_days_before,
  expected_delivery_days,
  notes,
  is_active,
  snoozed_until,
  last_dismissed_occurrence,
  suppliers!supplier_purchase_schedules_company_id_supplier_id_fkey ( name, status ),
  categories!supplier_purchase_schedules_company_id_category_id_fkey ( name )
`;

function mapSchedule(row: ScheduleRow): SupplierPurchaseSchedule {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name ?? "Fornecedor",
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    label: row.label,
    weekday: row.weekday,
    preferredTime: row.preferred_time,
    intervalWeeks: row.interval_weeks,
    anchorDate: row.anchor_date,
    reminderDaysBefore: row.reminder_days_before,
    expectedDeliveryDays: row.expected_delivery_days,
    notes: row.notes,
    isActive: row.is_active,
  };
}

export async function listSupplierPurchaseSchedules(
  companyId: string,
  supplierId: string,
): Promise<SupplierPurchaseSchedule[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_purchase_schedules")
    .select(SCHEDULE_SELECT)
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .order("is_active", { ascending: false })
    .order("weekday");

  if (error) throw new Error(`Falha ao carregar a agenda: ${error.message}`);
  return ((data ?? []) as unknown as ScheduleRow[]).map(mapSchedule);
}

type TemplateRow = {
  id: string;
  schedule_id: string;
  product_id: string;
  default_quantity: number;
  notes: string | null;
  products: {
    name: string;
    is_active: boolean;
    purchase_unit: { symbol: string } | null;
  } | null;
};

const TEMPLATE_SELECT = `
  id,
  schedule_id,
  product_id,
  default_quantity,
  notes,
  products!supplier_purchase_schedule_items_company_id_product_id_fkey (
    name,
    is_active,
    purchase_unit:units!products_company_id_purchase_unit_id_fkey ( symbol )
  )
`;

function mapTemplateItem(row: TemplateRow): ScheduleTemplateItem {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    productId: row.product_id,
    productName: row.products?.name ?? "Produto",
    purchaseUnit: row.products?.purchase_unit?.symbol ?? "",
    quantity: String(row.default_quantity).replace(".", ","),
    notes: row.notes,
    isActive: row.products?.is_active ?? false,
  };
}

export async function listSupplierScheduleTemplateItems(
  companyId: string,
  supplierId: string,
): Promise<ScheduleTemplateItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_purchase_schedule_items")
    .select(
      `${TEMPLATE_SELECT}, supplier_purchase_schedules!inner ( supplier_id )`,
    )
    .eq("company_id", companyId)
    .eq("supplier_purchase_schedules.supplier_id", supplierId)
    .order("sort_order")
    .order("created_at");

  if (error) {
    throw new Error(
      `Falha ao carregar os produtos da agenda: ${error.message}`,
    );
  }
  return ((data ?? []) as unknown as TemplateRow[]).map(mapTemplateItem);
}

export async function getScheduleTemplateItems(
  companyId: string,
  scheduleId: string,
): Promise<ScheduleTemplateItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_purchase_schedule_items")
    .select(TEMPLATE_SELECT)
    .eq("company_id", companyId)
    .eq("schedule_id", scheduleId)
    .order("sort_order")
    .order("created_at");

  if (error) {
    throw new Error(`Falha ao carregar o modelo de compra: ${error.message}`);
  }
  return ((data ?? []) as unknown as TemplateRow[]).map(mapTemplateItem);
}

export async function getSupplierScheduleTemplateItems(
  companyId: string,
  scheduleId: string,
  supplierId: string,
): Promise<ScheduleTemplateItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data: schedule, error } = await supabase
    .from("supplier_purchase_schedules")
    .select("id")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("id", scheduleId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao conferir o modelo de compra: ${error.message}`);
  }
  if (!schedule) return [];
  return getScheduleTemplateItems(companyId, scheduleId);
}

export async function listScheduleProductOptions(
  companyId: string,
): Promise<ScheduleProductOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, purchase_unit:units!products_company_id_purchase_unit_id_fkey(symbol)",
    )
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Falha ao listar produtos para o modelo: ${error.message}`);
  }
  return (data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    purchaseUnit: product.purchase_unit?.symbol ?? "",
  }));
}

type Activity = { supplier_id: string; created_at: string };

const DAY_MS = 86_400_000;

function dateUtc(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = dateUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(later: string, earlier: string) {
  return Math.round(
    (dateUtc(later).getTime() - dateUtc(earlier).getTime()) / DAY_MS,
  );
}

function occurrenceFor(row: ScheduleRow, today: string) {
  const anchor = dateUtc(row.anchor_date);
  const offset = (row.weekday - anchor.getUTCDay() + 7) % 7;
  const first = addDays(row.anchor_date, offset);
  const period = row.interval_weeks * 7;

  if (today < first) {
    return diffDays(first, today) <= row.reminder_days_before ? first : null;
  }

  const elapsed = Math.floor(diffDays(today, first) / period);
  const previous = addDays(first, elapsed * period);
  if (previous === today) return previous;

  const next = addDays(previous, period);
  // Ao entrar na antecedência do próximo ciclo, ele substitui o ciclo antigo.
  return diffDays(next, today) <= row.reminder_days_before ? next : previous;
}

function localDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(instant),
  );
}

export async function listPurchaseScheduleAlerts(
  companyId: string,
): Promise<PurchaseScheduleAlert[]> {
  const supabase = await createServerSupabaseClient();
  return listPurchaseScheduleAlertsWithClient(companyId, supabase);
}

export async function listPurchaseScheduleAlertsWithClient(
  companyId: string,
  supabase: SupabaseClient<Database>,
): Promise<PurchaseScheduleAlert[]> {
  const [{ data: company, error: companyError }, { data, error }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .single(),
      supabase
        .from("supplier_purchase_schedules")
        .select(SCHEDULE_SELECT)
        .eq("company_id", companyId)
        .eq("is_active", true),
    ]);

  if (companyError) {
    throw new Error(
      `Falha ao carregar o fuso da agenda: ${companyError.message}`,
    );
  }
  if (error) throw new Error(`Falha ao carregar a agenda: ${error.message}`);

  const timezone = company.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  const rows = (data ?? []) as unknown as ScheduleRow[];
  const candidates = rows.flatMap((row) => {
    if (row.suppliers?.status !== "active") return [];
    const occurrence = occurrenceFor(row, today);
    if (!occurrence) return [];
    if (row.last_dismissed_occurrence === occurrence) return [];
    if (row.snoozed_until && row.snoozed_until > today) return [];
    return [{ row, occurrence }];
  });

  if (candidates.length === 0) return [];

  const earliestCycle = candidates.reduce((earliest, candidate) => {
    const start = addDays(
      candidate.occurrence,
      -(candidate.row.interval_weeks * 7) + 1,
    );
    return start < earliest ? start : earliest;
  }, today);

  const [orders, rounds, templateItems] = await Promise.all([
    supabase
      .from("orders")
      .select("supplier_id, created_at")
      .eq("company_id", companyId)
      .neq("status", "cancelled")
      .gte("created_at", `${earliestCycle}T00:00:00Z`),
    supabase
      .from("round_suppliers")
      .select("supplier_id, created_at, purchase_rounds!inner(status)")
      .eq("company_id", companyId)
      .neq("purchase_rounds.status", "cancelled")
      .gte("created_at", `${earliestCycle}T00:00:00Z`),
    supabase
      .from("supplier_purchase_schedule_items")
      .select("schedule_id, products!inner(is_active)")
      .eq("company_id", companyId)
      .eq("products.is_active", true)
      .in(
        "schedule_id",
        candidates.map((candidate) => candidate.row.id),
      ),
  ]);

  if (orders.error) {
    throw new Error(
      `Falha ao conferir pedidos da agenda: ${orders.error.message}`,
    );
  }
  if (rounds.error) {
    throw new Error(
      `Falha ao conferir cotações da agenda: ${rounds.error.message}`,
    );
  }
  if (templateItems.error) {
    throw new Error(
      `Falha ao conferir o modelo da agenda: ${templateItems.error.message}`,
    );
  }

  const activities: Activity[] = [
    ...((orders.data ?? []) as Activity[]),
    ...((rounds.data ?? []) as unknown as Activity[]),
  ];
  const itemCount = new Map<string, number>();
  for (const item of templateItems.data ?? []) {
    itemCount.set(item.schedule_id, (itemCount.get(item.schedule_id) ?? 0) + 1);
  }

  return candidates
    .filter(({ row, occurrence }) => {
      const cycleStart = addDays(occurrence, -(row.interval_weeks * 7) + 1);
      return !activities.some(
        (activity) =>
          activity.supplier_id === row.supplier_id &&
          localDate(activity.created_at, timezone) >= cycleStart,
      );
    })
    .map(({ row, occurrence }): PurchaseScheduleAlert => {
      const daysUntil = diffDays(occurrence, today);
      return {
        ...mapSchedule(row),
        occurrenceDate: occurrence,
        daysUntil,
        status:
          daysUntil < 0 ? "overdue" : daysUntil === 0 ? "today" : "upcoming",
        templateItemCount: itemCount.get(row.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.daysUntil - b.daysUntil ||
        a.supplierName.localeCompare(b.supplierName),
    );
}
