import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DemandRecurrence } from "@/features/demand-calendar/model";
import { demandPeriodOverlapsRange } from "@/features/demand-calendar/recurrence";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type PurchaseSuggestion = {
  productId: string;
  productName: string;
  purchaseUnit: string;
  historicalCycleQuantity: number | null;
  expectedCycleQuantity: number | null;
  demandAdjustmentPercent: number;
  demandContexts: { name: string; adjustmentPercent: number }[];
  currentWeekReceivedQuantity: number;
  openOrderQuantity: number;
  openQuotationQuantity: number;
  shoppingListQuantity: number;
  suggestedQuantity: number | null;
  activeWeeks: number;
  observedWeeks: number;
  variationPercent: number;
  confidence: "high" | "medium";
  lastReceivedAt: string | null;
  cadenceWeeks: 1 | 2 | 4;
  cadenceConfidencePercent: number;
  historyEventCount: number;
  historicalNfeCount: number;
  receiptCount: number;
  quantityEventCount: number;
  quantityReliable: boolean;
  currentCycleHasPurchase: boolean;
  nextExpectedDate: string;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
};

export async function listPurchaseSuggestions(
  companyId: string,
): Promise<PurchaseSuggestion[]> {
  const supabase = await createServerSupabaseClient();
  return listPurchaseSuggestionsWithClient(companyId, supabase);
}

export async function listPurchaseSuggestionsWithClient(
  companyId: string,
  supabase: SupabaseClient<Database>,
): Promise<PurchaseSuggestion[]> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (companyError) {
    throw new Error(
      `Falha ao ler o fuso das sugestões: ${companyError.message}`,
    );
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timezone,
  }).format(new Date());
  const todayDate = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  const weekStartDate = new Date(todayDate);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - mondayOffset);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const [baselines, events] = await Promise.all([
    supabase.rpc("rpc_get_purchase_demand_baselines", {
      p_company_id: companyId,
      p_history_weeks: 52,
      p_limit: 100,
    }),
    supabase
      .from("demand_calendar_events")
      .select(
        "name, adjustment_percent, scope, category_id, product_id, start_date, end_date, recurrence, recurrence_until",
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .lte("start_date", weekEnd),
  ]);

  if (baselines.error) {
    throw new Error(
      `Falha ao calcular sugestões de compra: ${baselines.error.message}`,
    );
  }
  if (events.error) {
    throw new Error(`Falha ao aplicar o calendário: ${events.error.message}`);
  }

  return (baselines.data ?? [])
    .map((row) => {
      const contexts = (events.data ?? [])
        .filter(
          (event) =>
            demandPeriodOverlapsRange(
              {
                startDate: event.start_date,
                endDate: event.end_date,
                recurrence: event.recurrence as DemandRecurrence,
                recurrenceUntil: event.recurrence_until,
              },
              weekStart,
              weekEnd,
            ) &&
            (event.scope === "all" ||
              (event.scope === "category" &&
                event.category_id === row.category_id) ||
              (event.scope === "product" &&
                event.product_id === row.product_id)),
        )
        .map((event) => ({
          name: event.name,
          adjustmentPercent: Number(event.adjustment_percent),
        }));
      const demandAdjustmentPercent = Math.max(
        -80,
        Math.min(
          200,
          contexts.reduce(
            (total, context) => total + context.adjustmentPercent,
            0,
          ),
        ),
      );
      const historicalCycleQuantity = row.quantity_reliable
        ? Number(row.historical_weekly_quantity)
        : null;
      const expectedCycleQuantity =
        historicalCycleQuantity === null
          ? null
          : Number(
              (
                historicalCycleQuantity *
                (1 + demandAdjustmentPercent / 100)
              ).toFixed(3),
            );
      const currentWeekReceivedQuantity = Number(
        row.current_week_received_quantity,
      );
      const openOrderQuantity = Number(row.open_order_quantity);
      const openQuotationQuantity = Number(row.open_quotation_quantity);
      const shoppingListQuantity = Number(row.shopping_list_quantity);
      const covered =
        currentWeekReceivedQuantity +
        openOrderQuantity +
        openQuotationQuantity +
        shoppingListQuantity;

      return {
        productId: row.product_id,
        productName: row.product_name,
        purchaseUnit: row.purchase_unit,
        historicalCycleQuantity,
        expectedCycleQuantity,
        demandAdjustmentPercent,
        demandContexts: contexts,
        currentWeekReceivedQuantity,
        openOrderQuantity,
        openQuotationQuantity,
        shoppingListQuantity,
        suggestedQuantity:
          expectedCycleQuantity === null
            ? null
            : Number(Math.max(expectedCycleQuantity - covered, 0).toFixed(3)),
        activeWeeks: row.active_weeks,
        observedWeeks: row.observed_weeks,
        variationPercent: Number(row.variation_percent),
        confidence:
          row.confidence === "high" ? ("high" as const) : ("medium" as const),
        lastReceivedAt: row.last_received_at ?? null,
        cadenceWeeks: row.cadence_weeks as 1 | 2 | 4,
        cadenceConfidencePercent: Number(row.cadence_confidence_percent),
        historyEventCount: row.history_event_count,
        historicalNfeCount: row.historical_nfe_count,
        receiptCount: row.receipt_count,
        quantityEventCount: row.quantity_event_count,
        quantityReliable: row.quantity_reliable,
        currentCycleHasPurchase: row.current_cycle_has_purchase,
        nextExpectedDate: row.next_expected_date,
        preferredSupplierId: row.preferred_supplier_id,
        preferredSupplierName: row.preferred_supplier_name,
      };
    })
    .filter(
      (suggestion) =>
        suggestion.suggestedQuantity === null ||
        suggestion.suggestedQuantity > 0,
    )
    .sort(
      (left, right) =>
        Number(right.demandAdjustmentPercent !== 0) -
          Number(left.demandAdjustmentPercent !== 0) ||
        Number(right.confidence === "high") -
          Number(left.confidence === "high") ||
        (right.suggestedQuantity ?? 0) - (left.suggestedQuantity ?? 0),
    )
    .slice(0, 12);
}
