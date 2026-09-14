import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Cotação pública — o que o fornecedor vê e responde, sem login.
 *
 * Tudo passa por `rpc_public_get_quotation` e `rpc_public_submit_quotation`,
 * que são SECURITY DEFINER e resolvem o token por hash. O app nunca consulta
 * `public_access_tokens` direto: `anon` não tem SELECT nela, de propósito.
 */

/**
 * Unidade como o link público a recebe.
 *
 * `name` e `kind` chegam a partir da migration 0110 e são opcionais de
 * propósito: um link já aberto continua válido sem eles, caindo na sigla.
 */
export type PublicUnit = {
  id: string;
  code: string;
  symbol: string;
  name?: string | null;
  kind?: string | null;
};

export type PublicAttribute = {
  attribute_definition_id: string;
  name: string;
  key: string;
  data_type: "text" | "numeric" | "boolean";
  required: boolean;
  is_conversion_factor: boolean;
  suggested_value_numeric: number | null;
  suggested_confirmed_at: string | null;
  unit: Omit<PublicUnit, "code"> | null;
};

export type PublicQuotationItem = {
  supplier_quotation_item_id: string;
  quotation_item_id: string;
  group: string;
  product_name: string;
  requested_quantity: string;
  purpose?: "resale" | "internal" | "production" | "packaging" | "other";
  purchase_unit: PublicUnit;
  pricing_unit: PublicUnit;
  comparison_unit: PublicUnit | null;
  notes: string | null;
  already_answered: boolean;
  last_supplier_price: number | null;
  last_supplier_price_at: string | null;
  attributes: PublicAttribute[];
};

export type PublicQuotation = {
  company: {
    name: string;
    legal_name: string | null;
    logo_path: string | null;
  };
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

  const [quotationResult, conversionResult, priceContextResult] =
    await Promise.all([
      supabase.rpc("rpc_public_get_quotation", { p_token: token }),
      supabase.rpc("rpc_public_get_quotation_conversion_context", {
        p_token: token,
      }),
      supabase.rpc("rpc_public_get_quotation_price_context", {
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
  if (priceContextResult.error && priceContextResult.error.code !== "PGRST202") {
    throw new Error(
      `Falha ao carregar referências de preço: ${priceContextResult.error.message}`,
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
  const priceContextByItem = new Map(
    (priceContextResult.data ?? []).map((context) => [
      context.supplier_quotation_item_id,
      context,
    ]),
  );

  return {
    ...quotation,
    items: quotation.items.map((item) => {
      const priceContext = priceContextByItem.get(
        item.supplier_quotation_item_id,
      );
      return {
        ...item,
        last_supplier_price: priceContext?.last_supplier_price ?? null,
        last_supplier_price_at: priceContext?.last_supplier_price_at ?? null,
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
      };
    }),
  };
}
