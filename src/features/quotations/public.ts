import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Cotação pública — o que o fornecedor vê e responde, sem login.
 *
 * Tudo passa por `rpc_public_get_quotation` e `rpc_public_submit_quotation`,
 * que são SECURITY DEFINER e resolvem o token por hash. O app nunca consulta
 * `public_access_tokens` direto: `anon` não tem SELECT nela, de propósito.
 */

export type PublicAttribute = {
  attribute_definition_id: string;
  name: string;
  key: string;
  data_type: "text" | "numeric" | "boolean";
  required: boolean;
  unit: { id: string; symbol: string } | null;
};

export type PublicQuotationItem = {
  supplier_quotation_item_id: string;
  quotation_item_id: string;
  group: string;
  product_name: string;
  requested_quantity: string;
  purchase_unit: { id: string; code: string; symbol: string };
  pricing_unit: { id: string; code: string; symbol: string };
  comparison_unit: { id: string; code: string; symbol: string } | null;
  notes: string | null;
  already_answered: boolean;
  attributes: PublicAttribute[];
};

export type PublicQuotation = {
  company: { name: string; legal_name: string | null };
  supplier: { id: string; name: string };
  purchase_round: { id: string; title: string };
  items: PublicQuotationItem[];
};

/**
 * Lê a cotação pelo token bruto da URL.
 *
 * Devolve null quando o token não resolve — expirado, revogado ou inventado.
 * A RPC responde `42501` nos três casos, sem distinguir: contar qual deles foi
 * ajudaria quem estivesse tentando adivinhar token.
 */
export async function getPublicQuotation(
  token: string,
): Promise<PublicQuotation | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("rpc_public_get_quotation", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao abrir a cotação: ${error.message}`);
  }

  return data as unknown as PublicQuotation;
}
