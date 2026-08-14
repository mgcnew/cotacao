"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NegotiationState = { error: string | null; savedAt?: number };

export const NEGOTIATION_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Telefone" },
  { value: "in_person", label: "Pessoalmente" },
  { value: "other", label: "Outro" },
] as const;

const schema = z.object({
  responseItemId: z.uuid({ error: "Item de resposta inválido" }),
  roundId: z.uuid({ error: "Rodada inválida" }),
  newPrice: z
    .string()
    .trim()
    .min(1, { error: "Informe o novo preço" })
    .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v >= 0, {
      error: "Preço inválido",
    }),
  channel: z.enum(["whatsapp", "phone", "in_person", "other"], {
    error: "Escolha o canal",
  }),
  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/**
 * Registra um preço negociado.
 *
 * Vai pela RPC `rpc_record_negotiation` porque ela é quem sabe qual é o
 * "preço anterior": o último negociado, ou o cotado quando ainda não houve
 * negociação. Escrever direto em `negotiations` obrigaria a duplicar essa
 * regra aqui, e o histórico ficaria errado na segunda rodada de conversa.
 *
 * A permissão exigida é `negotiation.create`, verificada dentro da RPC.
 */
export async function recordNegotiation(
  _prev: NegotiationState,
  formData: FormData,
): Promise<NegotiationState> {
  const company = await requireActiveCompany();

  const parsed = schema.safeParse({
    responseItemId: formData.get("responseItemId"),
    roundId: formData.get("roundId"),
    newPrice: formData.get("newPrice"),
    channel: formData.get("channel"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_record_negotiation", {
    p_company_id: company.companyId,
    p_quotation_response_item_id: parsed.data.responseItemId,
    p_new_price: parsed.data.newPrice,
    p_channel: parsed.data.channel,
    p_notes: parsed.data.notes,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite registrar negociação." };
    }
    return { error: `Não foi possível registrar: ${error.message}` };
  }

  revalidatePath(`/compras/${parsed.data.roundId}/comparacao`);
  return { error: null, savedAt: Date.now() };
}
