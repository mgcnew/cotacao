export type PriceFeedbackBand = "lowest" | "up_to_5" | "5_to_10" | "above_10" | "insufficient";
export type PublicQuotationReceipt = {
  submitted_at: string | null;
  response_status: string | null;
  comparison_enabled: boolean;
  items: {
    item_id: string;
    product_name: string;
    requested_quantity: number;
    purchase_unit: string;
    pricing_unit: string;
    comparison_unit: string | null;
    quoted_price: number | null;
    is_available: boolean | null;
    does_not_supply: boolean;
    notes: string | null;
    form_base_per_unit: number | null;
    attributes: { name: string; value: string | null; unit: string | null }[];
    comparison_band: PriceFeedbackBand | null;
  }[];
};

export const PRICE_FEEDBACK_LABELS: Record<PriceFeedbackBand, string> = {
  lowest: "Sua oferta está entre os menores preços recebidos.",
  up_to_5: "Sua oferta está até 5% acima da melhor oferta comparável.",
  "5_to_10": "Sua oferta está mais de 5% e até 10% acima da melhor oferta comparável.",
  above_10: "Sua oferta está mais de 10% acima da melhor oferta comparável.",
  insufficient: "Ainda não há referência suficiente para comparar.",
};

export function parseQuotationReceipt(value: unknown): PublicQuotationReceipt | null {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items) ||
      !("comparison_enabled" in value) || typeof value.comparison_enabled !== "boolean") return null;
  return value as PublicQuotationReceipt;
}
