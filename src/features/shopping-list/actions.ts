"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { listPurchaseSuggestions } from "@/features/shopping-list/suggestions";
import {
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ShoppingListState = { error: string | null; savedAt?: number };
export type PurchaseSuggestionState = {
  error: string | null;
  savedAt?: number;
  savedCount?: number;
};

function canManage(permissions: Set<string>) {
  return (
    permissions.has("product.update") ||
    permissions.has("purchase_round.create") ||
    permissions.has("order.create")
  );
}

async function requireManage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!canManage(permissions))
    throw new Error("Sem permissão para alterar a lista.");
  return company;
}

async function getOrCreateOpenList(companyId: string, userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("shopping_lists")
    .insert({ company_id: companyId, name: "Lista atual", created_by: userId })
    .select("id")
    .single();
  if (!error) return created.id;

  // Dois usuários podem adicionar o primeiro item ao mesmo tempo. O índice de
  // uma lista aberta resolve a corrida; quem perdeu relê a vencedora.
  if (error.code === "23505") {
    const { data: winner, error: retryError } = await supabase
      .from("shopping_lists")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "open")
      .single();
    if (!retryError) return winner.id;
  }
  throw new Error(`Não foi possível abrir a lista: ${error.message}`);
}

const itemSchema = z.object({
  productId: z.uuid({ error: "Escolha um produto da lista de sugestões." }),
  quantity: z
    .string()
    .trim()
    .transform((value) => Number(value.replace(/\./g, "").replace(",", ".")))
    .refine((value) => Number.isFinite(value) && value > 0, {
      error: "Quantidade deve ser maior que zero.",
    }),
  notes: z.string().trim().max(300, "Observação muito longa.").optional(),
});

export async function addShoppingListItem(
  _previous: ShoppingListState,
  formData: FormData,
): Promise<ShoppingListState> {
  const company = await requireManage();
  const user = await requireUser();
  const parsed = itemSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("purchase_unit_id, is_active")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.productId)
    .maybeSingle();
  if (productError || !product?.is_active) {
    return { error: "Produto não encontrado ou desativado." };
  }

  const listId = await getOrCreateOpenList(company.companyId, user.id);
  const { data: current } = await supabase
    .from("shopping_list_items")
    .select("id, requested_quantity")
    .eq("company_id", company.companyId)
    .eq("shopping_list_id", listId)
    .eq("product_id", parsed.data.productId)
    .eq("status", "pending")
    .maybeSingle();

  const write = current
    ? await supabase
        .from("shopping_list_items")
        .update({
          requested_quantity:
            Number(current.requested_quantity) + parsed.data.quantity,
          ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        })
        .eq("id", current.id)
        .eq("company_id", company.companyId)
    : await supabase.from("shopping_list_items").insert({
        company_id: company.companyId,
        shopping_list_id: listId,
        product_id: parsed.data.productId,
        purchase_unit_id: product.purchase_unit_id,
        requested_quantity: parsed.data.quantity,
        notes: parsed.data.notes || null,
        added_by: user.id,
      });

  if (write.error)
    return { error: `Não foi possível adicionar: ${write.error.message}` };
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}
export async function updateShoppingListItem(formData: FormData) {
  const company = await requireManage();
  const parsed = z
    .object({
      itemId: z.uuid(),
      quantity: z.coerce.number().positive(),
      notes: z.string().trim().max(300).optional(),
    })
    .safeParse({
      itemId: formData.get("itemId"),
      quantity: String(formData.get("quantity") ?? "").replace(",", "."),
      notes: formData.get("notes"),
    });
  if (!parsed.success) throw new Error("Quantidade ou observação inválida.");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      requested_quantity: parsed.data.quantity,
      notes: parsed.data.notes || null,
    })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.itemId)
    .eq("status", "pending");
  if (error) throw new Error(`Não foi possível atualizar: ${error.message}`);
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
}

export async function removeShoppingListItem(itemId: string) {
  const company = await requireManage();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ status: "removed" })
    .eq("company_id", company.companyId)
    .eq("id", itemId)
    .eq("status", "pending");
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
}

export async function importShoppingItemsToRound(
  _previous: ShoppingListState,
  formData: FormData,
): Promise<ShoppingListState> {
  const company = await requireActiveCompany();
  const ids = formData.getAll("shoppingItemId").map(String);
  if (ids.length === 0)
    return { error: "Selecione ao menos um item da lista." };

  const supabase = await createServerSupabaseClient();
  const roundId = String(formData.get("roundId") ?? "");
  const { data, error } = await supabase.rpc(
    "rpc_import_shopping_items_to_round",
    {
      p_company_id: company.companyId,
      p_round_id: roundId,
      p_group_id: String(formData.get("groupId") ?? "") || null,
      p_shopping_item_ids: ids,
    },
  );
  if (error) return { error: `Não foi possível importar: ${error.message}` };
  if (!data) return { error: "Nenhum item pendente pôde ser importado." };
  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}

export async function acceptHighConfidencePurchaseSuggestions(
  previous: PurchaseSuggestionState,
  formData: FormData,
): Promise<PurchaseSuggestionState> {
  void previous;
  void formData;
  const company = await requireManage();
  // Recalcula no servidor no momento da aprovação. Assim, uma tela antiga não
  // adiciona uma necessidade que já foi coberta por outro usuário ou pedido.
  const suggestions = (await listPurchaseSuggestions(company.companyId)).filter(
    (suggestion) =>
      suggestion.confidence === "high" && suggestion.suggestedQuantity !== null,
  );
  if (suggestions.length === 0) {
    return { error: "As sugestões já foram revisadas ou cobertas." };
  }

  const supabase = await createServerSupabaseClient();
  let savedCount = 0;
  for (const suggestion of suggestions) {
    const suggestedQuantity = suggestion.suggestedQuantity;
    if (suggestedQuantity === null) continue;
    const { error } = await supabase.rpc("rpc_accept_purchase_suggestion", {
      p_company_id: company.companyId,
      p_product_id: suggestion.productId,
      p_quantity: suggestedQuantity,
      p_suggested_quantity: suggestedQuantity,
    });
    if (error) {
      return {
        error:
          savedCount > 0
            ? `${savedCount} adicionada(s), mas o processo parou: ${error.message}`
            : `Não foi possível adicionar as sugestões: ${error.message}`,
        savedCount,
      };
    }
    savedCount += 1;
  }

  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now(), savedCount };
}

const suggestionSchema = z.object({
  productId: z.uuid(),
  suggestedQuantity: z.number().positive().nullable(),
});

function optionalPositiveDecimal(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

export async function acceptPurchaseSuggestion(
  _previous: PurchaseSuggestionState,
  formData: FormData,
): Promise<PurchaseSuggestionState> {
  const company = await requireManage();
  const parsed = suggestionSchema
    .extend({ quantity: z.coerce.number().positive() })
    .safeParse({
      productId: formData.get("productId"),
      suggestedQuantity: optionalPositiveDecimal(
        formData.get("suggestedQuantity"),
      ),
      quantity: String(formData.get("quantity") ?? "").replace(",", "."),
    });
  if (!parsed.success) return { error: "Informe uma quantidade válida." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_accept_purchase_suggestion", {
    p_company_id: company.companyId,
    p_product_id: parsed.data.productId,
    p_quantity: parsed.data.quantity,
    p_suggested_quantity: parsed.data.suggestedQuantity,
  });
  if (error) {
    return { error: `Não foi possível adicionar a sugestão: ${error.message}` };
  }

  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}

export async function dismissPurchaseSuggestion(
  _previous: PurchaseSuggestionState,
  formData: FormData,
): Promise<PurchaseSuggestionState> {
  const company = await requireManage();
  const parsed = suggestionSchema.safeParse({
    productId: formData.get("productId"),
    suggestedQuantity: optionalPositiveDecimal(
      formData.get("suggestedQuantity"),
    ),
  });
  if (!parsed.success) return { error: "Sugestão inválida." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_dismiss_purchase_suggestion", {
    p_company_id: company.companyId,
    p_product_id: parsed.data.productId,
    p_suggested_quantity: parsed.data.suggestedQuantity,
  });
  if (error) {
    return { error: `Não foi possível dispensar a sugestão: ${error.message}` };
  }

  revalidatePath("/lista-compras");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}
