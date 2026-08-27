import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type PurchaseSuggestion = {
  productId: string;
  productName: string;
  purchaseUnit: string;
  expectedWeeklyQuantity: number;
  currentWeekReceivedQuantity: number;
  openOrderQuantity: number;
  openQuotationQuantity: number;
  shoppingListQuantity: number;
  suggestedQuantity: number;
  activeWeeks: number;
  observedWeeks: number;
  variationPercent: number;
  confidence: "high" | "medium";
  lastReceivedAt: string | null;
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
  const { data, error } = await supabase.rpc("rpc_get_purchase_suggestions", {
    p_company_id: companyId,
    p_history_weeks: 8,
    p_limit: 12,
  });

  if (error) {
    throw new Error(`Falha ao calcular sugestões de compra: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    purchaseUnit: row.purchase_unit,
    expectedWeeklyQuantity: Number(row.expected_weekly_quantity),
    currentWeekReceivedQuantity: Number(row.current_week_received_quantity),
    openOrderQuantity: Number(row.open_order_quantity),
    openQuotationQuantity: Number(row.open_quotation_quantity),
    shoppingListQuantity: Number(row.shopping_list_quantity),
    suggestedQuantity: Number(row.suggested_quantity),
    activeWeeks: row.active_weeks,
    observedWeeks: row.observed_weeks,
    variationPercent: Number(row.variation_percent),
    confidence: row.confidence === "high" ? "high" : "medium",
    lastReceivedAt: row.last_received_at ?? null,
  }));
}
