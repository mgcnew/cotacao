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
  is_conversion_factor: boolean;
  suggested_value_numeric: number | null;
  suggested_confirmed_at: string | null;
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

  const [quotationResult, conversionResult] = await Promise.all([
    supabase.rpc("rpc_public_get_quotation", { p_token: token }),
    supabase.rpc("rpc_public_get_quotation_conversion_context", {
      p_token: token,
    }),
  ]);
  const { data, error } = quotationResult;

  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Falha ao abrir a cotação: ${error.message}`);
  }

  if (conversionResult.error && conversionResult.error.code !== "PGRST202") {
    throw new Error(
      `Falha ao carregar apresentações: ${conversionResult.error.message}`,
    );
  }

  const quotation = data as unknown as PublicQuotation;
  const contexts = (conversionResult.data ?? []) as unknown as {
    supplier_quotation_item_id: string;
    attribute_definition_id: string;
    suggested_value_numeric: number | null;
    suggested_confirmed_at: string | null;
  }[];
  const contextByItemAndAttribute = new Map(
    contexts.map((context) => [
      `${context.supplier_quotation_item_id}:${context.attribute_definition_id}`,
      context,
    ]),
  );

  return {
    ...quotation,
    items: quotation.items.map((item) => ({
      ...item,
      attributes: item.attributes.map((attribute) => {
        const context = contextByItemAndAttribute.get(
          `${item.supplier_quotation_item_id}:${attribute.attribute_definition_id}`,
        );
        return {
          ...attribute,
          is_conversion_factor: Boolean(context),
          suggested_value_numeric: context?.suggested_value_numeric ?? null,
          suggested_confirmed_at: context?.suggested_confirmed_at ?? null,
        };
      }),
    })),
  };
}
