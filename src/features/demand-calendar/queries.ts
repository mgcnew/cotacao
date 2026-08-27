import "server-only";

import type {
  DemandCalendarCategory,
  DemandCalendarEvent,
  DemandCalendarProduct,
  DemandEventType,
  DemandRecurrence,
  DemandScope,
} from "@/features/demand-calendar/model";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  recurrence: string;
  recurrence_until: string | null;
  adjustment_percent: number;
  scope: string;
  category_id: string | null;
  product_id: string | null;
  notes: string | null;
  is_active: boolean;
  categories: { name: string } | null;
  products: { name: string } | null;
};

export async function listDemandCalendarEvents(
  companyId: string,
): Promise<DemandCalendarEvent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("demand_calendar_events")
    .select(
      `
      id, name, event_type, start_date, end_date, recurrence, recurrence_until, adjustment_percent,
      scope, category_id, product_id, notes, is_active,
      categories!demand_calendar_events_company_id_category_id_fkey ( name ),
      products!demand_calendar_events_company_id_product_id_fkey ( name )
    `,
    )
    .eq("company_id", companyId)
    .order("is_active", { ascending: false })
    .order("end_date", { ascending: false });
  if (error) {
    throw new Error(
      `Falha ao carregar o calendário de demanda: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as EventRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    eventType: row.event_type as DemandEventType,
    startDate: row.start_date,
    endDate: row.end_date,
    recurrence: row.recurrence as DemandRecurrence,
    recurrenceUntil: row.recurrence_until,
    adjustmentPercent: Number(row.adjustment_percent),
    scope: row.scope as DemandScope,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    productId: row.product_id,
    productName: row.products?.name ?? null,
    notes: row.notes,
    isActive: row.is_active,
  }));
}

export async function listDemandCalendarOptions(companyId: string): Promise<{
  categories: DemandCalendarCategory[];
  products: DemandCalendarProduct[];
}> {
  const supabase = await createServerSupabaseClient();
  const [categories, products] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, category_id, categories!inner(name)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name"),
  ]);
  if (categories.error) {
    throw new Error(
      `Falha ao carregar categorias: ${categories.error.message}`,
    );
  }
  if (products.error) {
    throw new Error(`Falha ao carregar produtos: ${products.error.message}`);
  }

  return {
    categories: categories.data ?? [],
    products: (products.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
      categoryName: product.categories.name,
    })),
  };
}
