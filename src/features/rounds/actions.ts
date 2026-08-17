"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Montagem da Rodada de Compras.
 *
 * As RPCs do projeto cobrem o que vem depois — envio, resposta do fornecedor,
 * negociação, alocação e geração de pedido — porque são operações que tocam
 * várias tabelas de uma vez. A montagem (criar rodada, grupos, itens e
 * participantes) é escrita direta, contida por RLS com `purchase_round.create`
 * e `purchase_round.update`.
 *
 * O schema tem três triggers de integridade que valem lembrar, porque as
 * mensagens deles chegam aqui:
 *  - item precisa pertencer a um grupo da MESMA rodada;
 *  - contato precisa pertencer ao fornecedor informado;
 *  - fornecedor e item precisam ser da MESMA rodada.
 */

export type RoundFormState = { error: string | null; savedAt?: number };

function describeWriteError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Esse registro já existe nesta rodada.";
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "Seu papel não permite alterar rodadas de compra.";
  }
  return `Não foi possível salvar: ${error.message}`;
}

const roundSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: "Dê um título à rodada" })
    .max(120, { error: "Título muito longo" }),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function createRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();
  const user = await requireUser();

  const parsed = roundSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_rounds")
    .insert({
      company_id: company.companyId,
      title: parsed.data.title,
      notes: parsed.data.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: describeWriteError(error) };

  revalidatePath("/compras");
  redirect(`/compras/${data.id}`);
}

export async function createRoundGroup(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      name: z
        .string()
        .trim()
        .min(2, { error: "Informe o nome do grupo" })
        .max(80, { error: "Nome muito longo" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      name: formData.get("name"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("purchase_round_groups").insert({
    company_id: company.companyId,
    purchase_round_id: parsed.data.roundId,
    name: parsed.data.name,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Esta rodada já tem um grupo com esse nome."
          : describeWriteError(error),
    };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Adiciona um produto à rodada.
 *
 * As unidades vêm do cadastro do produto e ficam COPIADAS no item: se o
 * produto for reconfigurado depois, a rodada antiga continua contando a
 * história do jeito que ela aconteceu.
 */
export async function addQuotationItem(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      groupId: z.uuid({ error: "Escolha o grupo" }),
      productId: z.uuid({ error: "Escolha o produto" }),
      quantity: z
        .string()
        .trim()
        .min(1, { error: "Informe a quantidade" })
        .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
        .refine((v) => Number.isFinite(v) && v > 0, {
          error: "Quantidade deve ser maior que zero",
        }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      groupId: formData.get("groupId"),
      productId: formData.get("productId"),
      quantity: formData.get("quantity"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("purchase_unit_id, pricing_unit_id, comparison_unit_id")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (productError) {
    return { error: `Falha ao carregar o produto: ${productError.message}` };
  }
  if (!product) {
    return { error: "Produto não encontrado nesta empresa." };
  }

  const { data: item, error } = await supabase
    .from("quotation_items")
    .insert({
      company_id: company.companyId,
      purchase_round_id: parsed.data.roundId,
      group_id: parsed.data.groupId,
      product_id: parsed.data.productId,
      requested_quantity: parsed.data.quantity,
      purchase_unit_id: product.purchase_unit_id,
      pricing_unit_id: product.pricing_unit_id,
      comparison_unit_id: product.comparison_unit_id,
    })
    .select("id")
    .single();

  if (error) return { error: describeWriteError(error) };

  await linkItemToRoundSuppliers(parsed.data.roundId, item.id);

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Liga um item novo a todos os fornecedores já na rodada.
 *
 * Quem já recebeu o link é marcado com `added_after_initial_send`, que é como
 * o schema registra "isto entrou depois" — o documento mestre pede que itens
 * acrescentados sejam destacados para o fornecedor, e sem essa marca não teria
 * como saber quais são.
 */
async function linkItemToRoundSuppliers(roundId: string, itemId: string) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { data: roundSuppliers } = await supabase
    .from("round_suppliers")
    .select("id, first_sent_at")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", roundId);

  if (!roundSuppliers || roundSuppliers.length === 0) return;

  await supabase.from("supplier_quotation_items").insert(
    roundSuppliers.map((rs) => ({
      company_id: company.companyId,
      round_supplier_id: rs.id,
      quotation_item_id: itemId,
      added_after_initial_send: rs.first_sent_at !== null,
    })),
  );
}

/**
 * Coloca um fornecedor na rodada, já com todos os itens existentes.
 *
 * O contato principal ativo é escolhido automaticamente: é para ele que o link
 * da cotação vai.
 */
export async function addRoundSupplier(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      supplierId: z.uuid({ error: "Escolha o fornecedor" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      supplierId: formData.get("supplierId"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();

  const { data: contacts } = await supabase
    .from("supplier_contacts")
    .select("id, is_primary")
    .eq("company_id", company.companyId)
    .eq("supplier_id", parsed.data.supplierId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const contactId = contacts?.[0]?.id ?? null;
  if (!contactId) {
    return {
      error: "Este fornecedor não tem contato ativo. Cadastre um antes.",
    };
  }

  const { data: roundSupplier, error } = await supabase
    .from("round_suppliers")
    .insert({
      company_id: company.companyId,
      purchase_round_id: parsed.data.roundId,
      supplier_id: parsed.data.supplierId,
      supplier_contact_id: contactId,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Este fornecedor já está nesta rodada."
          : describeWriteError(error),
    };
  }

  // Todos os itens atuais da rodada vão para ele.
  const { data: items } = await supabase
    .from("quotation_items")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", parsed.data.roundId);

  if (items && items.length > 0) {
    const { error: linkError } = await supabase
      .from("supplier_quotation_items")
      .insert(
        items.map((item) => ({
          company_id: company.companyId,
          round_supplier_id: roundSupplier.id,
          quotation_item_id: item.id,
        })),
      );

    if (linkError) {
      return {
        error: `Fornecedor entrou na rodada, mas os itens não foram vinculados: ${linkError.message}`,
      };
    }
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Passa a rodada de rascunho para em andamento.
 *
 * Sem item ou sem fornecedor a rodada não teria o que cotar, então a checagem
 * vem antes — o banco aceitaria a mudança de status, mas o resultado seria uma
 * rodada ativa e vazia.
 *
 * Devolve estado em vez de lançar. Lançando, a frase "a rodada precisa de ao
 * menos um item e um fornecedor" — escrita para uma pessoa ler — chegava como
 * página de erro, e o usuário perdia a tela em que estava.
 */
export async function activateRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) return { error: "Rodada inválida." };

  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("purchase_round.update")) {
    return { error: "Seu papel não permite iniciar rodadas." };
  }

  const supabase = await createServerSupabaseClient();

  const [items, suppliers] = await Promise.all([
    supabase
      .from("quotation_items")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.companyId)
      .eq("purchase_round_id", roundId),
    supabase
      .from("round_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.companyId)
      .eq("purchase_round_id", roundId),
  ]);

  if ((items.count ?? 0) === 0) {
    return { error: "Adicione ao menos um produto antes de iniciar a rodada." };
  }
  if ((suppliers.count ?? 0) === 0) {
    return {
      error: "Convide ao menos um fornecedor antes de iniciar a rodada.",
    };
  }

  const { data, error } = await supabase
    .from("purchase_rounds")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("company_id", company.companyId)
    .eq("status", "draft")
    .select("id");

  if (error) return { error: describeWriteError(error) };

  // Nenhuma linha atualizada com UPDATE sem erro significa que o filtro de
  // status não casou: alguém já iniciou esta rodada em outra aba.
  if (!data || data.length === 0) {
    return { error: "Esta rodada já foi iniciada." };
  }

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}
