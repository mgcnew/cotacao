"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SubmitQuotationState = {
  error: string | null;
  submitted?: boolean;
};

type ResponseAttribute = {
  attribute_definition_id: string;
  value_text?: string;
  value_numeric?: string;
  value_boolean?: string;
};

type ResponseItem = {
  supplier_quotation_item_id: string;
  quoted_price?: string;
  is_available?: string;
  does_not_supply?: string;
  notes?: string;
  attributes?: ResponseAttribute[];
};

/** "12,50" → "12.50". O fornecedor digita como fala. */
function toNumericString(raw: string): string {
  return raw.replace(/\./g, "").replace(",", ".");
}

/**
 * Envia a resposta do fornecedor.
 *
 * Monta o payload a partir do formulário e entrega para
 * `rpc_public_submit_quotation`, que faz tudo numa transação: cria a resposta,
 * grava os itens e atributos, atualiza o catálogo conhecido do fornecedor
 * (confirmado / não fornece) e fecha a resposta quando tudo foi respondido.
 *
 * A regra de não sobrescrever item já respondido é do banco, não daqui — a RPC
 * recusa, e a correção vira ação do comprador, auditável. Aqui só traduzimos a
 * recusa para o fornecedor entender.
 */
export async function submitQuotation(
  _prev: SubmitQuotationState,
  formData: FormData,
): Promise<SubmitQuotationState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Link inválido." };

  const itemIds = formData.getAll("itemId").map(String);
  if (itemIds.length === 0) {
    return { error: "Nada para responder nesta cotação." };
  }

  const items: ResponseItem[] = [];

  for (const id of itemIds) {
    const responseStatus = String(formData.get(`status_${id}`) ?? "priced");
    const doesNotSupply =
      responseStatus === "does_not_supply" ||
      formData.get(`nao_fornece_${id}`) === "on";
    const unavailable = responseStatus === "unavailable";
    const rawPrice = String(formData.get(`preco_${id}`) ?? "").trim();

    if (!doesNotSupply && !unavailable && !rawPrice) {
      const productName = String(formData.get(`nome_${id}`) ?? "este item");
      return {
        error: `Informe o preço de "${productName}" ou marque que não fornece.`,
      };
    }

    const price = rawPrice ? toNumericString(rawPrice) : undefined;
    if (
      price !== undefined &&
      (!Number.isFinite(Number(price)) || Number(price) <= 0)
    ) {
      const productName = String(formData.get(`nome_${id}`) ?? "este item");
      return { error: `Informe um preço maior que zero em "${productName}".` };
    }

    const attributes: ResponseAttribute[] = [];
    for (const key of formData.keys()) {
      const prefix = `attr_${id}_`;
      if (!key.startsWith(prefix)) continue;

      const raw = String(formData.get(key) ?? "").trim();
      if (!raw) continue;

      const [definitionId, dataType] = key.slice(prefix.length).split("__");
      if (dataType === "numeric") {
        const numeric = toNumericString(raw);
        if (!Number.isFinite(Number(numeric))) {
          return { error: "Há um atributo numérico com valor inválido." };
        }
        attributes.push({
          attribute_definition_id: definitionId,
          value_numeric: numeric,
        });
      } else if (dataType === "boolean") {
        attributes.push({
          attribute_definition_id: definitionId,
          value_boolean: raw,
        });
      } else {
        attributes.push({
          attribute_definition_id: definitionId,
          value_text: raw,
        });
      }
    }

    items.push({
      supplier_quotation_item_id: id,
      does_not_supply: doesNotSupply ? "true" : "false",
      quoted_price: doesNotSupply || unavailable ? undefined : price,
      is_available: doesNotSupply ? undefined : unavailable ? "false" : "true",
      notes: String(formData.get(`obs_${id}`) ?? "").trim() || undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_public_submit_quotation", {
    p_token: token,
    p_items: items,
  });

  if (error) {
    if (error.message.includes("já foi respondido")) {
      return {
        error:
          "Algum item já havia sido respondido. Recarregue a página para ver o que falta.",
      };
    }
    if (error.code === "42501") {
      return { error: "Este link expirou ou não é mais válido." };
    }
    return { error: `Não foi possível enviar: ${error.message}` };
  }

  revalidatePath(`/q/${token}`);
  return { error: null, submitted: true };
}
