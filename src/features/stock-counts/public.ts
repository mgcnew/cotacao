import "server-only";

import { publicEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PublicStockCountItem = {
  product_id: string;
  name: string;
  category: string;
  unit: string;
  needs_recount: boolean;
  entries: { quantity: number; location: string | null; created_at: string }[];
};

export type PublicStockCount = {
  company: { name: string; timezone: string };
  generated_at: string;
  name: string | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  author: string | null;
  items: PublicStockCountItem[];
};

/** O endereço que vai na mensagem; o mesmo enquanto ninguém trocar o link. */
export function stockCountPublicUrl(token: string) {
  return `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/c/${token}`;
}

/** Leitura sem login, pelo token; `null` quando o link não vale (ou foi trocado). */
export async function getPublicStockCount(
  token: string,
): Promise<PublicStockCount | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_public_get_stock_count", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao carregar a contagem: ${error.message}`);
  }

  const count = data as unknown as PublicStockCount;
  return {
    ...count,
    // numeric chega como número no jsonb, mas não custa garantir.
    items: count.items.map((item) => ({
      ...item,
      entries: item.entries.map((entry) => ({
        ...entry,
        quantity: Number(entry.quantity),
      })),
    })),
  };
}
