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
    // `nullish`, e não `optional`: FormData.get devolve null quando o campo
    // não existe no DOM — é o caso do preço, que só é renderizado quando o
    // fornecedor fornece o item. `optional()` sozinho recusaria esse null.
    price: z
      .string()
      .trim()
      .nullish()
      .transform((v) => v ?? undefined),
    notes: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((v) => (v ? v : undefined)),
    // Obrigatório pelo banco, e com razão: correção mexe no que o fornecedor
    // declarou, então precisa dizer por quê.
    reason: z
      .string({ error: "Explique o motivo da correção" })
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

/**
 * Lança o preço de um item no lugar do fornecedor.
 *
 * O caso é o do dia a dia: manda-se o link, mas negocia-se por telefone. Quando
 * o preço vem por fora, quem compra lança — e a rodada anda sem depender de o
 * fornecedor entrar no link.
 *
 * É o PRIMEIRO preço do item. Item já respondido se altera por
 * `correctResponseItem`, que guarda o histórico da correção; a RPC recusa aqui
 * justamente para não existirem dois caminhos gravando o mesmo valor.
 */
export async function recordManualQuotationItem(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const supplierQuotationItemId = String(
    formData.get("supplierQuotationItemId") ?? "",
  );
  const doesNotSupply = formData.get("doesNotSupply") === "on";
  const precoBruto = String(formData.get("quotedPrice") ?? "").trim();

  if (!supplierQuotationItemId) return { error: "Item inválido." };

  // "12,50" é como se digita preço em português.
  const preco = precoBruto
    ? Number(precoBruto.replace(/\./g, "").replace(",", "."))
    : null;

  if (!doesNotSupply && (preco === null || !Number.isFinite(preco))) {
    return { error: "Informe o preço." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_record_manual_quotation_item", {
    p_company_id: company.companyId,
    p_supplier_quotation_item_id: supplierQuotationItemId,
    p_quoted_price: doesNotSupply ? undefined : (preco ?? undefined),
    p_does_not_supply: doesNotSupply,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite lançar respostas." };
    }
    if (error.message.includes("já tem resposta")) {
      return { error: "Este item já tem resposta — use a correção." };
    }
    if (error.message.includes("em andamento")) {
      return { error: "A rodada precisa estar em andamento para lançar preço." };
    }
    return { error: `Não foi possível lançar: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId}/comparacao`);
  revalidatePath(`/compras/${roundId}`);
  revalidatePath(`/compras/${roundId}/alocacao`);
  // A tabela de Compras e a Central de Atenção leem o progresso agregado da
  // rodada. Sem invalidá-las, o preço manual já existia no banco, mas a barra
  // atrás do modal continuava mostrando o número anterior até um recarregamento.
  revalidatePath("/compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}
