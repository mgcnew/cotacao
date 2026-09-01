"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  barcodeCandidates,
  normalizeBarcode,
} from "@/features/products/barcodes";
import {
  parseProductSpreadsheet,
  isValidGtin,
} from "@/features/products/import-parser";
import {
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { normalizeEntityName } from "@/lib/entity-name";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProductImportUploadState = { error: string | null };
export type ProductImportItemActionState = {
  error: string | null;
  message: string | null;
  savedAt?: number;
};

function chunks<T>(items: T[], size = 200) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function requireImportPermission() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("product.create"))
    throw new Error("Seu papel não permite importar produtos.");
  return company;
}

function suggestedCategoryName(sourceCategory: string) {
  const value = normalizeEntityName(sourceCategory);
  if (value.includes("embutidos")) return "Embutidos";
  if (value.includes("frangos")) return "Aves";
  if (value.includes("carne") || value.includes("miudeza bovina"))
    return "Bovino";
  if (value.includes("suinos")) return "Suinos";
  if (value.includes("refrigerantes")) return "Refrigerantes";
  if (value.includes("cervejas")) return "Bebidas alcoolicas";
  if (value.includes("mercearia") || value.includes("temperos"))
    return "Mercearia";
  if (value.includes("assados")) return "Processados";
  return null;
}

function defaultUnitCode(sourceCategory: string) {
  const value = normalizeEntityName(sourceCategory);
  if (value.endsWith(" pc")) return "pc";
  return value.startsWith("1.") && !value.includes("com codigos") ? "kg" : "un";
}

export async function uploadProductImportAction(
  _previous: ProductImportUploadState,
  formData: FormData,
): Promise<ProductImportUploadState> {
  try {
    const [company, user] = await Promise.all([
      requireImportPermission(),
      requireUser(),
    ]);
    const file = formData.get("file");
    if (!(file instanceof File))
      return { error: "Selecione uma planilha .xlsx ou .csv." };
    const parsed = await parseProductSpreadsheet(file);
    const supabase = await createServerSupabaseClient();
    const [
      { data: categories, error: categoryError },
      { data: units, error: unitError },
    ] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name")
        .eq("company_id", company.companyId)
        .eq("is_active", true),
      supabase
        .from("units")
        .select("id,code")
        .eq("company_id", company.companyId)
        .eq("is_active", true),
    ]);
    if (categoryError || unitError)
      throw new Error(categoryError?.message ?? unitError?.message);

    const categoryByName = new Map(
      (categories ?? []).map((item) => [
        normalizeEntityName(item.name),
        item.id,
      ]),
    );
    const unitByCode = new Map(
      (units ?? []).map((item) => [normalizeEntityName(item.code), item.id]),
    );
    const existingNames = new Map<string, string>();
    const existingBarcodes = new Map<string, string>();
    for (const group of chunks(
      [
        ...new Set(
          parsed.rows.map((row) => normalizeEntityName(row.proposedName)),
        ),
      ],
      150,
    )) {
      const { data, error } = await supabase
        .from("products")
        .select("id,normalized_name")
        .eq("company_id", company.companyId)
        .in("normalized_name", group);
      if (error) throw new Error(error.message);
      data?.forEach((item) => existingNames.set(item.normalized_name, item.id));
    }
    const barcodeSearch = [
      ...new Set(
        parsed.rows.flatMap((row) =>
          row.barcode ? [...barcodeCandidates(row.barcode)] : [],
        ),
      ),
    ];
    for (const group of chunks(barcodeSearch, 150)) {
      const { data, error } = await supabase
        .from("product_barcodes")
        .select("product_id,code")
        .eq("company_id", company.companyId)
        .in("code", group);
      if (error) throw new Error(error.message);
      data?.forEach((item) => existingBarcodes.set(item.code, item.product_id));
    }

    const { data: batch, error: batchError } = await supabase
      .from("product_import_batches")
      .insert({
        company_id: company.companyId,
        file_name: file.name.slice(0, 240),
        sheet_name: parsed.sheetName.slice(0, 120),
        total_rows: parsed.rows.length,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (batchError || !batch)
      throw new Error(batchError?.message ?? "Não foi possível criar o lote.");

    try {
      const sourceCategories = [
        ...new Set(parsed.rows.map((row) => row.sourceCategory)),
      ];
      const mappings = sourceCategories.map((sourceCategory) => {
        const suggestedCategory = suggestedCategoryName(sourceCategory);
        const unitId = unitByCode.get(defaultUnitCode(sourceCategory)) ?? null;
        return {
          company_id: company.companyId,
          batch_id: batch.id,
          source_category: sourceCategory,
          category_id: suggestedCategory
            ? (categoryByName.get(normalizeEntityName(suggestedCategory)) ??
              null)
            : null,
          purchase_unit_id: unitId,
          pricing_unit_id: unitId,
          comparison_unit_id: unitId,
          confirmed_at: null,
        };
      });
      const mappingBySource = new Map(
        mappings.map((item) => [item.source_category, item]),
      );
      const { error: mappingError } = await supabase
        .from("product_import_mappings")
        .insert(mappings);
      if (mappingError) throw new Error(mappingError.message);

      const records = parsed.rows.map((row) => {
        const mapping = mappingBySource.get(row.sourceCategory)!;
        const issues = [...row.issues];
        const nameDuplicate = existingNames.get(
          normalizeEntityName(row.proposedName),
        );
        const barcodeDuplicate = row.barcode
          ? [...barcodeCandidates(row.barcode)]
              .map((code) => existingBarcodes.get(code))
              .find(Boolean)
          : undefined;
        if (nameDuplicate) issues.push("duplicate_name_catalog");
        if (barcodeDuplicate) issues.push("duplicate_barcode_catalog");
        const duplicateProductId = nameDuplicate ?? barcodeDuplicate ?? null;
        return {
          company_id: company.companyId,
          batch_id: batch.id,
          source_row: row.sourceRow,
          source_code: row.sourceCode,
          raw_name: row.rawName,
          raw_barcode: row.rawBarcode,
          source_category: row.sourceCategory,
          proposed_name: row.proposedName,
          barcode: row.barcode,
          category_id: mapping.category_id,
          purchase_unit_id: mapping.purchase_unit_id,
          pricing_unit_id: mapping.pricing_unit_id,
          comparison_unit_id: mapping.comparison_unit_id,
          issues: [...new Set(issues)],
          duplicate_product_id: duplicateProductId,
          // A unidade inferida pela seção é apenas uma sugestão. O produto só
          // fica pronto após a confirmação explícita da seção ou o salvamento
          // individual, evitando publicar KG como UN silenciosamente.
          status: issues.length ? "blocked" : "pending",
        };
      });
      for (const group of chunks(records, 250)) {
        const { error } = await supabase
          .from("product_import_items")
          .insert(group);
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      await supabase
        .from("product_import_batches")
        .update({ status: "cancelled" })
        .eq("company_id", company.companyId)
        .eq("id", batch.id);
      throw error;
    }
    redirect(`/produtos/importacoes/${batch.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível importar a planilha.",
    };
  }
}

export async function applyProductImportMappingAction(formData: FormData) {
  const company = await requireImportPermission();
  const batchId = String(formData.get("batchId") ?? "");
  const sourceCategory = String(formData.get("sourceCategory") ?? "");
  const value = (key: string) => String(formData.get(key) ?? "") || null;
  const mapping = {
    category_id: value("categoryId"),
    purchase_unit_id: value("purchaseUnitId"),
    pricing_unit_id: value("pricingUnitId"),
    comparison_unit_id: value("comparisonUnitId"),
  };
  if (
    !mapping.category_id ||
    !mapping.purchase_unit_id ||
    !mapping.pricing_unit_id
  ) {
    redirect(
      `/produtos/importacoes/${batchId}?erro=${encodeURIComponent("Escolha a categoria e as unidades de compra e precificação antes de confirmar a seção.")}`,
    );
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("product_import_mappings")
    .update({ ...mapping, confirmed_at: new Date().toISOString() })
    .eq("company_id", company.companyId)
    .eq("batch_id", batchId)
    .eq("source_category", sourceCategory);
  if (error)
    redirect(
      `/produtos/importacoes/${batchId}?erro=${encodeURIComponent(error.message)}`,
    );
  const { data: items, error: readError } = await supabase
    .from("product_import_items")
    .select("id,issues,status")
    .eq("company_id", company.companyId)
    .eq("batch_id", batchId)
    .eq("source_category", sourceCategory)
    .in("status", ["pending", "ready", "blocked"]);
  if (readError)
    redirect(
      `/produtos/importacoes/${batchId}?erro=${encodeURIComponent(readError.message)}`,
    );
  const blockedIds = (items ?? [])
    .filter((item) => item.issues.length)
    .map((item) => item.id);
  const clearIds = (items ?? [])
    .filter((item) => !item.issues.length)
    .map((item) => item.id);
  const configured = Boolean(
    mapping.category_id && mapping.purchase_unit_id && mapping.pricing_unit_id,
  );
  for (const [ids, status] of [
    [blockedIds, "blocked"],
    [clearIds, configured ? "ready" : "pending"],
  ] as const) {
    for (const group of chunks(ids, 250)) {
      const { error: updateError } = await supabase
        .from("product_import_items")
        .update({ ...mapping, status })
        .eq("company_id", company.companyId)
        .in("id", group);
      if (updateError)
        redirect(
          `/produtos/importacoes/${batchId}?erro=${encodeURIComponent(updateError.message)}`,
        );
    }
  }
  revalidatePath(`/produtos/importacoes/${batchId}`);
}

export async function updateProductImportItemAction(
  _previousState: ProductImportItemActionState,
  formData: FormData,
): Promise<ProductImportItemActionState> {
  const company = await requireImportPermission();
  const batchId = String(formData.get("batchId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const proposedName = String(formData.get("proposedName") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const barcode =
    normalizeBarcode(String(formData.get("barcode") ?? "")) || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const purchaseUnitId = String(formData.get("purchaseUnitId") ?? "") || null;
  const pricingUnitId = String(formData.get("pricingUnitId") ?? "") || null;
  const comparisonUnitId =
    String(formData.get("comparisonUnitId") ?? "") || null;
  const issues: string[] = [];
  if (proposedName.length < 2 || proposedName.length > 120)
    issues.push("invalid_name");
  if (barcode && /^\d+$/.test(barcode) && !isValidGtin(barcode))
    issues.push("invalid_barcode");
  const supabase = await createServerSupabaseClient();
  const { data: duplicateName } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("normalized_name", normalizeEntityName(proposedName))
    .maybeSingle();
  let duplicateBarcode: { product_id: string } | null = null;
  if (barcode) {
    const result = await supabase
      .from("product_barcodes")
      .select("product_id")
      .eq("company_id", company.companyId)
      .in("code", [...barcodeCandidates(barcode)])
      .limit(1)
      .maybeSingle();
    duplicateBarcode = result.data;
  }
  const { data: duplicateDraft } = await supabase
    .from("product_import_items")
    .select("id,barcode")
    .eq("company_id", company.companyId)
    .eq("batch_id", batchId)
    .eq("normalized_name", normalizeEntityName(proposedName))
    .neq("id", itemId)
    .not("status", "in", "(ignored,imported)")
    .limit(1)
    .maybeSingle();
  if (duplicateName) issues.push("duplicate_name_catalog");
  if (duplicateBarcode) issues.push("duplicate_barcode_catalog");
  if (duplicateDraft) issues.push("duplicate_name_file");
  if (barcode) {
    const { data: barcodeDraft } = await supabase
      .from("product_import_items")
      .select("id")
      .eq("company_id", company.companyId)
      .eq("batch_id", batchId)
      .in("barcode", [...barcodeCandidates(barcode)])
      .neq("id", itemId)
      .not("status", "in", "(ignored,imported)")
      .limit(1)
      .maybeSingle();
    if (barcodeDraft) issues.push("duplicate_barcode_file");
  }
  const configured = Boolean(categoryId && purchaseUnitId && pricingUnitId);
  const { error } = await supabase
    .from("product_import_items")
    .update({
      proposed_name: proposedName,
      barcode,
      category_id: categoryId,
      purchase_unit_id: purchaseUnitId,
      pricing_unit_id: pricingUnitId,
      comparison_unit_id: comparisonUnitId,
      issues,
      duplicate_product_id:
        duplicateName?.id ?? duplicateBarcode?.product_id ?? null,
      status: issues.length ? "blocked" : configured ? "ready" : "pending",
      error_message: null,
    })
    .eq("company_id", company.companyId)
    .eq("batch_id", batchId)
    .eq("id", itemId)
    .in("status", ["pending", "ready", "blocked"]);
  if (error) return { error: error.message, message: null, savedAt: Date.now() };

  if (issues.length === 0 && configured) {
    const { data: published, error: publishError } = await supabase.rpc(
      "rpc_publish_product_import_items",
      {
        p_company_id: company.companyId,
        p_batch_id: batchId,
        p_item_ids: [itemId],
      },
    );
    if (publishError) {
      revalidatePath(`/produtos/importacoes/${batchId}`);
      return {
        error: `Alterações salvas, mas o produto não foi publicado: ${publishError.message}`,
        message: null,
        savedAt: Date.now(),
      };
    }

    revalidatePath("/produtos");
    revalidatePath("/produtos/importacoes");
    revalidatePath(`/produtos/importacoes/${batchId}`);
    return {
      error: null,
      message:
        published === 1
          ? "Produto salvo e adicionado ao catálogo."
          : "Produto salvo.",
      savedAt: Date.now(),
    };
  }

  revalidatePath(`/produtos/importacoes/${batchId}`);
  return {
    error: null,
    message: issues.length
      ? "Alterações salvas. Revise as pendências indicadas."
      : "Produto salvo. Complete categoria e unidades para publicá-lo.",
    savedAt: Date.now(),
  };
}

export async function toggleProductImportItemAction(
  _previousState: ProductImportItemActionState,
  formData: FormData,
): Promise<ProductImportItemActionState> {
  const company = await requireImportPermission();
  const batchId = String(formData.get("batchId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const ignore = formData.get("ignore") === "true";
  const supabase = await createServerSupabaseClient();
  const { data: item, error: readError } = await supabase
    .from("product_import_items")
    .select(
      "issues,source_category,category_id,purchase_unit_id,pricing_unit_id",
    )
    .eq("company_id", company.companyId)
    .eq("batch_id", batchId)
    .eq("id", itemId)
    .single();
  if (readError)
    return { error: readError.message, message: null, savedAt: Date.now() };
  if (!item)
    return {
      error: "Produto do rascunho não encontrado.",
      message: null,
      savedAt: Date.now(),
    };
  const mapping = ignore
    ? { data: null, error: null }
    : await supabase
        .from("product_import_mappings")
        .select("confirmed_at")
        .eq("company_id", company.companyId)
        .eq("batch_id", batchId)
        .eq("source_category", item.source_category)
        .maybeSingle();
  if (mapping.error) {
    return {
      error: mapping.error.message,
      message: null,
      savedAt: Date.now(),
    };
  }
  const { error: updateError } = await supabase
      .from("product_import_items")
      .update({
        status: ignore
          ? "ignored"
          : item.issues.length
            ? "blocked"
            : mapping.data?.confirmed_at &&
                item.category_id &&
                item.purchase_unit_id &&
                item.pricing_unit_id
              ? "ready"
              : "pending",
      })
      .eq("company_id", company.companyId)
      .eq("id", itemId);
  if (updateError)
    return { error: updateError.message, message: null, savedAt: Date.now() };
  revalidatePath(`/produtos/importacoes/${batchId}`);
  return {
    error: null,
    message: ignore
      ? "Produto ignorado nesta importação."
      : "Produto restaurado para o rascunho.",
    savedAt: Date.now(),
  };
}

export async function publishProductImportItemsAction(formData: FormData) {
  const company = await requireImportPermission();
  const batchId = String(formData.get("batchId") ?? "");
  const itemIds = formData.getAll("itemId").map(String).slice(0, 100);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_publish_product_import_items",
    {
      p_company_id: company.companyId,
      p_batch_id: batchId,
      p_item_ids: itemIds,
    },
  );
  if (error)
    redirect(
      `/produtos/importacoes/${batchId}?erro=${encodeURIComponent(error.message)}`,
    );
  revalidatePath("/produtos");
  revalidatePath(`/produtos/importacoes/${batchId}`);
  redirect(`/produtos/importacoes/${batchId}?sucesso=${data ?? 0}`);
}
