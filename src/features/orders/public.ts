import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PublicOrderItem = {
  order_revision_item_id: string;
  product_name: string;
  requested_quantity: string;
  purchase_unit: { symbol: string };
  pricing_unit: { symbol: string };
  estimated_pricing_quantity?: string | null;
  agreed_price: string;
  notes: string | null;
  packaging_presentation: {
    quantity_per_package: number;
    comparison_unit_symbol: string;
    confirmed_at: string;
  } | null;
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

  const [orderResult, packagingResult] = await Promise.all([
    supabase.rpc("rpc_public_get_order", { p_token: token }),
    supabase.rpc("rpc_public_get_order_packaging_context", {
      p_token: token,
    }),
  ]);
  const { data, error } = orderResult;

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao abrir o pedido: ${error.message}`);
  }

  if (packagingResult.error && packagingResult.error.code !== "PGRST202") {
    throw new Error(
      `Falha ao carregar apresentações do pedido: ${packagingResult.error.message}`,
    );
  }

  const order = data as unknown as PublicOrder;
  const contexts = (packagingResult.data ?? []) as unknown as {
    order_revision_item_id: string;
    quantity_per_package: number;
    comparison_unit_symbol: string;
    confirmed_at: string;
  }[];
  const contextByItem = new Map(
    contexts.map((context) => [context.order_revision_item_id, context]),
  );

  return {
    ...order,
    revision: {
      ...order.revision,
      items: order.revision.items.map((item) => ({
        ...item,
        packaging_presentation:
          contextByItem.get(item.order_revision_item_id) ?? null,
      })),
    },
  };
}
