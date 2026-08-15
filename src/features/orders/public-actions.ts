"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ConfirmOrderState = { error: string | null; confirmed?: boolean };

/**
 * Confirmação do pedido pelo fornecedor, sem login.
 *
 * `rpc_public_confirm_order` resolve o token, marca a revisão como confirmada
 * e move o pedido para `awaiting_delivery` — que é o estado que libera o
 * recebimento do lado do comprador.
 */
export async function confirmOrder(
  _prev: ConfirmOrderState,
  formData: FormData,
): Promise<ConfirmOrderState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Link inválido." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_public_confirm_order", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "Este link expirou ou não é mais válido." };
    }
    return { error: `Não foi possível confirmar: ${error.message}` };
  }

  revalidatePath(`/o/${token}`);
  return { error: null, confirmed: true };
}

export type DivergenceState = { error: string | null; reported?: boolean };

/**
 * Divergência relatada pelo fornecedor, no próprio link do pedido.
 *
 * É a alternativa honesta a confirmar um pedido que ele não consegue cumprir:
 * em vez de aceitar e falhar na entrega, ele diz agora o que está errado.
 * A RPC marca a revisão como `contested`, e o comprador resolve do lado dele
 * — o pedido não avança para entrega enquanto isso.
 */
export async function reportOrderDivergence(
  _prev: DivergenceState,
  formData: FormData,
): Promise<DivergenceState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Link inválido." };

  const type = String(formData.get("type") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const itemId = String(formData.get("orderRevisionItemId") ?? "").trim();

  if (!type) return { error: "Escolha o que está diferente." };
  if (notes.length < 3) {
    return { error: "Explique a divergência para o comprador entender." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_public_report_order_divergence", {
    p_token: token,
    p_divergences: [
      {
        type,
        notes,
        // Vazio quando a divergência é do pedido inteiro, não de um item.
        order_revision_item_id: itemId || undefined,
      },
    ],
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "Este link expirou ou não é mais válido." };
    }
    if (error.message.includes("não está disponível")) {
      return {
        error:
          "Este pedido não aceita mais divergência — ele já foi confirmado ou substituído.",
      };
    }
    return { error: `Não foi possível registrar: ${error.message}` };
  }

  revalidatePath(`/o/${token}`);
  return { error: null, reported: true };
}
