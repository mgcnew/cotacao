import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReceivingDisplayLinkStatus = {
  active: boolean;
  createdAt: string | null;
  lastAccessedAt: string | null;
};

export type PublicReceivingDisplayItem = {
  item_id: string;
  product_name: string;
  requested_quantity: number;
  received_quantity: number;
  pending_quantity: number;
  purchase_unit: string;
  agreed_price: number;
  pricing_unit: string;
};

export type PublicReceivingDisplayOrder = {
  order_number: number;
  status: "awaiting_delivery" | "partially_received";
  supplier_id: string;
  supplier_name: string;
  delivery_due_date: string | null;
  items: PublicReceivingDisplayItem[];
};

export type PublicReceivingDisplay = {
  company: { name: string; timezone: string };
  generated_at: string;
  orders: PublicReceivingDisplayOrder[];
};

export async function getReceivingDisplayLinkStatus(
  companyId: string,
): Promise<ReceivingDisplayLinkStatus> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receiving_display_links")
    .select("created_at,last_accessed_at")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    // A tela continua utilizável antes de a migration ser aplicada.
    if (["42P01", "PGRST205"].includes(error.code)) {
      return { active: false, createdAt: null, lastAccessedAt: null };
    }
    throw new Error(`Falha ao carregar o link do painel: ${error.message}`);
  }

  return {
    active: Boolean(data),
    createdAt: data?.created_at ?? null,
    lastAccessedAt: data?.last_accessed_at ?? null,
  };
}

export async function getPublicReceivingDisplay(
  token: string,
): Promise<PublicReceivingDisplay | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_public_get_receiving_display",
    { p_token: token },
  );

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao carregar as entregas: ${error.message}`);
  }

  return data as unknown as PublicReceivingDisplay;
}
