"use server";

import { revalidatePath } from "next/cache";
import { parseQuotationReceipt, type PublicQuotationReceipt } from "@/features/quotations/receipt";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundedMoneyString } from "@/lib/money";

export type SubmitQuotationState = {
  error: string | null;
  submitted?: boolean;
  partial?: boolean;
  receivedItemIds?: string[];
  answeredItems?: number;
  totalItems?: number;
  uncertain?: boolean;
  receipt?: PublicQuotationReceipt | null;
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
  /** Quanto da unidade-base vem em 1 da forma deste fornecedor (0131). */
  form_base_per_unit?: string;
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
    const responseStatus = String(formData.get(`status_${id}`) ?? "");
    if (
      responseStatus !== "priced" &&
      responseStatus !== "unavailable" &&
      responseStatus !== "does_not_supply"
    ) {
      const productName = String(formData.get(`nome_${id}`) ?? "este item");
      return { error: `Escolha a disponibilidade de "${productName}".` };
    }
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

    const normalizedPrice = rawPrice ? toNumericString(rawPrice) : undefined;
    const price = normalizedPrice
      ? roundedMoneyString(normalizedPrice)
      : undefined;
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

    // Só existe no item em outra forma de compra ("cada cx com ___ un"), e só
    // conta quando há preço: sem preço não há o que dividir.
    const rawForm = String(formData.get(`forma_${id}`) ?? "").trim();
    const formBasePerUnit =
      rawForm && !doesNotSupply && !unavailable ? toNumericString(rawForm) : undefined;
    if (
      !doesNotSupply && !unavailable && formData.has(`forma_${id}`) &&
      (formBasePerUnit === undefined || !Number.isFinite(Number(formBasePerUnit)) || !(Number(formBasePerUnit) > 0))
    ) {
      const productName = String(formData.get(`nome_${id}`) ?? "este item");
      return {
        error: `Informe quanto vem em cada embalagem de "${productName}", com um número maior que zero.`,
      };
    }

    items.push({
      supplier_quotation_item_id: id,
      form_base_per_unit: formBasePerUnit,
      does_not_supply: doesNotSupply ? "true" : "false",
      quoted_price: doesNotSupply || unavailable ? undefined : price,
      is_available: doesNotSupply ? undefined : unavailable ? "false" : "true",
      notes: String(formData.get(`obs_${id}`) ?? "").trim() || undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
    });
  }

  let result;
  try {
    const supabase = await createServerSupabaseClient();
    result = await supabase.rpc("rpc_public_submit_quotation_validated", {
      p_token: token,
      p_items: items,
    });
  } catch (cause) {
    console.error("[submitQuotation] Não foi possível confirmar o envio", cause);
    return {
      error: "Não foi possível confirmar o recebimento. Reabra a cotação para verificar se a resposta chegou antes de tentar novamente. O rascunho neste aparelho foi mantido quando disponível.",
      uncertain: true,
    };
  }
  const { data, error } = result;

  if (error) {
    if (error.message.includes("já foi respondido")) {
      return {
        error: "Algum item já havia sido respondido. Reabra a cotação para ver o que falta.",
        uncertain: true,
      };
    }
    if (error.code === "42501") {
      return { error: "Este link expirou ou não é mais válido. Peça um novo link ao comprador." };
    }
    return { error: "Não foi possível enviar a resposta. Confira os campos e tente novamente. Seu preenchimento foi mantido nesta página." };
  }

  if (!data || typeof data !== "object" || Array.isArray(data) ||
      (data.status !== "completed" && data.status !== "partial")) {
    return { error: "Não foi possível confirmar a conclusão. Reabra a cotação para conferir as respostas recebidas.", uncertain: true };
  }
  let receipt: PublicQuotationReceipt | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.rpc("rpc_public_get_quotation_receipt", { p_token: token });
    if (result.error) throw new Error(result.error.message);
    receipt = parseQuotationReceipt(result.data);
  } catch (cause) {
    // O envio já concluiu: o fornecedor pode reabrir o link para ver o resumo.
    console.error("[submitQuotation] Falha ao carregar o resumo", cause);
  }
  try {
    revalidatePath(`/q/${token}`);
  } catch (cause) {
    // A resposta já foi gravada: falhar ao invalidar o cache não desfaz o envio.
    console.error("[submitQuotation] Falha ao atualizar a página", cause);
  }
  return {
    error: null, submitted: true, receipt, partial: data.status === "partial",
    receivedItemIds: items.map((item) => item.supplier_quotation_item_id),
    answeredItems: typeof data.answered_items === "number" ? data.answered_items : undefined,
    totalItems: typeof data.total_items === "number" ? data.total_items : undefined,
  };
}
