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
