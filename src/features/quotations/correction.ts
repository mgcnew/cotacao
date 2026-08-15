"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CorrectionState = { error: string | null; savedAt?: number };

const schema = z
  .object({
    responseItemId: z.uuid({ error: "Item de resposta inválido" }),
    roundId: z.uuid({ error: "Rodada inválida" }),
    supplies: z.enum(["sim", "nao"]),
    price: z.string().trim().optional(),
    notes: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => (v ? v : undefined)),
    // Obrigatório pelo banco, e com razão: correção mexe no que o fornecedor
    // declarou, então precisa dizer por quê.
    reason: z
      .string()
      .trim()
      .min(3, { error: "Explique o motivo da correção" })
      .max(300, { error: "Motivo muito longo" }),
  })
  .refine((v) => v.supplies === "nao" || (v.price && v.price.length > 0), {
    error: "Informe o preço corrigido",
    path: ["price"],
  });

/**
 * Corrige a resposta de um fornecedor.
 *
 * É o caminho previsto pelo documento: o fornecedor não pode reenviar item já
 * respondido, então o ajuste — preço digitado errado, "não fornece" marcado
 * sem querer — é ação do comprador, e fica auditável.
 *
 * A RPC grava uma linha em `response_item_corrections` para CADA campo
 * alterado, com valor antigo, valor novo, motivo e autor. Por isso não
 * enviamos o que não mudou: passar tudo geraria histórico de correções que
 * não aconteceram.
 */
export async function correctResponseItem(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const company = await requireActiveCompany();

  const parsed = schema.safeParse({
    responseItemId: formData.get("responseItemId"),
    roundId: formData.get("roundId"),
    supplies: formData.get("supplies"),
    price: formData.get("price"),
    notes: formData.get("notes"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const fornece = parsed.data.supplies === "sim";

  let price: number | undefined;
  if (fornece && parsed.data.price) {
    price = Number(parsed.data.price.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      return { error: "Preço inválido." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_correct_quotation_response_item", {
    p_company_id: company.companyId,
    p_quotation_response_item_id: parsed.data.responseItemId,
    p_quoted_price: price,
    p_is_available: fornece,
    p_does_not_supply: !fornece,
    p_notes: parsed.data.notes,
    p_reason: parsed.data.reason,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite corrigir respostas." };
    }
    return { error: `Não foi possível corrigir: ${error.message}` };
  }

  revalidatePath(`/compras/${parsed.data.roundId}/comparacao`);
  return { error: null, savedAt: Date.now() };
}
