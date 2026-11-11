"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StockCountResult = { error: string | null };

/** Mesmas permissões da lista de compras; o banco repete a regra na RLS. */
async function requireCounter() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (
    !permissions.has("product.update") &&
    !permissions.has("purchase_round.create") &&
    !permissions.has("order.create")
  ) {
    throw new Error("Sem permissão para contar estoque.");
  }
  return company;
}

const nameSchema = z
  .string()
  .trim()
  .max(120, "Nome muito longo.")
  .transform((value) => value || null);

export async function createStockCount(
  _previous: StockCountResult,
  formData: FormData,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const parsed = nameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .insert({ company_id: company.companyId, name: parsed.data })
    .select("id")
    .single();
  if (error) return { error: `Não foi possível criar: ${error.message}` };

  revalidatePath("/contagens");
  redirect(`/contagens/${data.id}`);
}

export async function renameStockCount(
  countId: string,
  name: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_counts")
    .update({ name: parsed.data })
    .eq("company_id", company.companyId)
    .eq("id", countId);
  if (error) return { error: `Não foi possível renomear: ${error.message}` };

  revalidatePath("/contagens");
  revalidatePath(`/contagens/${countId}`);
  return { error: null };
}

/** Finalizar trava os lançamentos; reabrir é para quem esqueceu um canto. */
export async function setStockCountStatus(
  countId: string,
  status: "open" | "closed",
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_counts")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
    })
    .eq("company_id", company.companyId)
    .eq("id", countId);
  if (error) return { error: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/contagens");
  revalidatePath(`/contagens/${countId}`);
  return { error: null };
}

export async function deleteStockCount(
  countId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_counts")
    .delete()
    .eq("company_id", company.companyId)
    .eq("id", countId);
  if (error) return { error: `Não foi possível excluir: ${error.message}` };

  revalidatePath("/contagens");
  redirect("/contagens");
}

const entrySchema = z.object({
  countId: z.uuid(),
  entryId: z.uuid(),
  productId: z.uuid(),
  unitId: z.uuid(),
  quantity: z
    .number()
    .refine((value) => Number.isFinite(value) && value >= 0 && value <= 999_999, {
      error: "Quantidade inválida.",
    }),
  location: z
    .string()
    .trim()
    .max(60, "Local muito longo.")
    .transform((value) => value || null),
});

/**
 * Um lançamento: "7 na geladeira".
 *
 * O id vem da tela, que já mostra o lançamento antes da resposta — assim dá
 * para apagá-lo na hora, sem esperar o servidor devolver o id dele. Sem
 * `revalidatePath`: quem conta em sequência não pode esperar a página inteira
 * ser refeita a cada número.
 */
export async function addCountEntry(input: {
  countId: string;
  entryId: string;
  productId: string;
  unitId: string;
  quantity: number;
  location: string;
}): Promise<StockCountResult> {
  const company = await requireCounter();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { countId, entryId, productId, unitId, quantity, location } =
    parsed.data;

  const supabase = await createServerSupabaseClient();
  const findItem = () =>
    supabase
      .from("stock_count_items")
      .select("id, needs_recount")
      .eq("company_id", company.companyId)
      .eq("stock_count_id", countId)
      .eq("product_id", productId)
      .maybeSingle();

  let { data: item } = await findItem();
  if (!item) {
    const created = await supabase
      .from("stock_count_items")
      .insert({
        company_id: company.companyId,
        stock_count_id: countId,
        product_id: productId,
        unit_id: unitId,
      })
      .select("id, needs_recount")
      .single();
    // Duas pessoas lançando o mesmo produto ao mesmo tempo: quem perdeu a
    // corrida pelo item usa o da outra.
    if (created.error?.code === "23505") item = (await findItem()).data;
    else if (created.error) {
      return { error: lancamentoRecusado(created.error.message) };
    } else item = created.data;
  }
  if (!item) return { error: "Não foi possível registrar o produto." };

  const { error } = await supabase.from("stock_count_entries").insert({
    id: entryId,
    company_id: company.companyId,
    stock_count_id: countId,
    stock_count_item_id: item.id,
    quantity,
    location,
  });
  if (error) return { error: lancamentoRecusado(error.message) };

  // Recontado: o primeiro número novo tira o produto do destaque.
  if (item.needs_recount) {
    await supabase
      .from("stock_count_items")
      .update({ needs_recount: false })
      .eq("company_id", company.companyId)
      .eq("id", item.id);
  }
  return { error: null };
}

/** A RLS recusa em silêncio de detalhe; o motivo provável é a contagem fechada. */
function lancamentoRecusado(message: string) {
  return message.includes("row-level security")
    ? "A contagem foi finalizada. Reabra para lançar."
    : `Não foi possível lançar: ${message}`;
}

/**
 * Apaga o lançamento; o último a sair leva o produto junto — menos quando ele
 * está marcado para recontar, que precisa continuar na lista esperando.
 */
export async function deleteCountEntry(
  countId: string,
  entryId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { data: removed, error } = await supabase
    .from("stock_count_entries")
    .delete()
    .eq("company_id", company.companyId)
    .eq("stock_count_id", countId)
    .eq("id", entryId)
    .select("stock_count_item_id")
    .maybeSingle();
  if (error) return { error: `Não foi possível apagar: ${error.message}` };
  if (!removed) return { error: "Lançamento não encontrado." };

  const { count } = await supabase
    .from("stock_count_entries")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("stock_count_item_id", removed.stock_count_item_id);
  if (count === 0) {
    await supabase
      .from("stock_count_items")
      .delete()
      .eq("company_id", company.companyId)
      .eq("id", removed.stock_count_item_id)
      .eq("needs_recount", false);
  }
  return { error: null };
}

export async function setCountItemUnit(
  countId: string,
  productId: string,
  unitId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  if (!z.uuid().safeParse(unitId).success) {
    return { error: "Unidade inválida." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_count_items")
    .update({ unit_id: unitId })
    .eq("company_id", company.companyId)
    .eq("stock_count_id", countId)
    .eq("product_id", productId);
  if (error) return { error: `Não foi possível trocar: ${error.message}` };
  return { error: null };
}

/** Tira o produto da contagem com todos os lançamentos dele. */
export async function removeCountItem(
  countId: string,
  productId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_count_items")
    .delete()
    .eq("company_id", company.companyId)
    .eq("stock_count_id", countId)
    .eq("product_id", productId);
  if (error) return { error: `Não foi possível remover: ${error.message}` };
  return { error: null };
}

/** Liga ou desliga o "recontar" do produto. */
export async function setCountItemRecount(
  countId: string,
  productId: string,
  needsRecount: boolean,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_count_items")
    .update({ needs_recount: needsRecount })
    .eq("company_id", company.companyId)
    .eq("stock_count_id", countId)
    .eq("product_id", productId)
    .select("id");
  if (error) return { error: `Não foi possível marcar: ${error.message}` };
  if (!data?.length) {
    return { error: "A contagem foi finalizada. Reabra para marcar." };
  }
  return { error: null };
}

/**
 * Recontar do zero: apaga os lançamentos do produto e o deixa marcado, na
 * lista, esperando o número novo — sem isso 31 + recontagem de 30 virava 61.
 */
export async function restartCountItem(
  countId: string,
  productId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const supabase = await createServerSupabaseClient();
  const { data: item, error } = await supabase
    .from("stock_count_items")
    .update({ needs_recount: true })
    .eq("company_id", company.companyId)
    .eq("stock_count_id", countId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Não foi possível zerar: ${error.message}` };
  if (!item) return { error: "A contagem foi finalizada. Reabra para recontar." };

  const { error: deleteError } = await supabase
    .from("stock_count_entries")
    .delete()
    .eq("company_id", company.companyId)
    .eq("stock_count_item_id", item.id);
  if (deleteError) {
    return { error: `Não foi possível zerar: ${deleteError.message}` };
  }
  return { error: null };
}

/** Troca o link público: o anterior para de abrir na hora. */
export async function rotateStockCountLink(
  countId: string,
): Promise<StockCountResult> {
  const company = await requireCounter();
  const token = randomBytes(16).toString("base64url");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("stock_counts")
    .update({ public_token: token })
    .eq("company_id", company.companyId)
    .eq("id", countId);
  if (error) return { error: `Não foi possível trocar o link: ${error.message}` };

  revalidatePath(`/contagens/${countId}`);
  return { error: null };
}
