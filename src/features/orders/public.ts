import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PublicOrderItem = {
  order_revision_item_id: string;
  product_name: string;
  requested_quantity: string;
  purchase_unit: { symbol: string };
  pricing_unit: { symbol: string };
  agreed_price: string;
  notes: string | null;
};

export type PublicOrder = {
  company: { name: string; legal_name: string | null };
  supplier: { id: string; name: string };
  order: { id: string; order_number: number; status: string };
  revision: {
    id: string;
    revision_number: number;
    status: string;
    delivery_due_date: string | null;
    items: PublicOrderItem[];
  };
};

/** Lê o pedido pelo token bruto. null quando o token não resolve. */
export async function getPublicOrder(
  token: string,
): Promise<PublicOrder | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("rpc_public_get_order", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao abrir o pedido: ${error.message}`);
  }

  return data as unknown as PublicOrder;
}
