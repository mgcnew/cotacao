import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listProductImportBatches(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_import_batches")
    .select("id,file_name,sheet_name,status,total_rows,created_at,completed_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar importações: ${error.message}`);
  return data ?? [];
}

export async function getProductImportBatch(
  companyId: string,
  batchId: string,
) {
  const supabase = await createServerSupabaseClient();
  const [
    { data: batch, error: batchError },
    { data: mappings, error: mappingsError },
  ] = await Promise.all([
    supabase
      .from("product_import_batches")
      .select(
        "id,file_name,sheet_name,status,total_rows,created_at,completed_at",
      )
      .eq("company_id", companyId)
      .eq("id", batchId)
      .maybeSingle(),
    supabase
      .from("product_import_mappings")
      .select(
        "id,source_category,category_id,purchase_unit_id,pricing_unit_id,comparison_unit_id",
      )
      .eq("company_id", companyId)
      .eq("batch_id", batchId)
      .order("source_category"),
  ]);
  const error = batchError ?? mappingsError;
  if (error) throw new Error(`Falha ao carregar importação: ${error.message}`);
  return { batch, mappings: mappings ?? [] };
}

export async function listProductImportItems(
  companyId: string,
  batchId: string,
  filters: { search: string; status: string; page: number; pageSize: number },
) {
  const supabase = await createServerSupabaseClient();
  const buildQuery = (page: number) => {
    let query = supabase
      .from("product_import_items")
      .select(
        "id,source_row,source_code,raw_name,raw_barcode,source_category,proposed_name,barcode,category_id,purchase_unit_id,pricing_unit_id,comparison_unit_id,status,issues,duplicate_product_id,imported_product_id,error_message",
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .eq("batch_id", batchId);
    if (filters.status) query = query.eq("status", filters.status);
    const term = filters.search.replace(/[%_,().]/g, " ").trim();
    if (term)
      query = query.or(
        `proposed_name.ilike.%${term}%,barcode.ilike.%${term}%,source_code.ilike.%${term}%`,
      );
    return query
      .order("source_row")
      .range((page - 1) * filters.pageSize, page * filters.pageSize - 1);
  };
  let page = Math.max(1, filters.page);
  let result = await buildQuery(page);
  if (result.error)
    throw new Error(`Falha ao listar itens: ${result.error.message}`);
  const total = result.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / filters.pageSize));
  if (page > lastPage) {
    page = lastPage;
    result = await buildQuery(page);
    if (result.error)
      throw new Error(`Falha ao listar itens: ${result.error.message}`);
  }
  return { items: result.data ?? [], total, page };
}

export async function countProductImportItems(
  companyId: string,
  batchId: string,
) {
  const supabase = await createServerSupabaseClient();
  const statuses = [
    "pending",
    "ready",
    "blocked",
    "ignored",
    "imported",
    "error",
  ] as const;
  const results = await Promise.all(
    statuses.map((status) =>
      supabase
        .from("product_import_items")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("batch_id", batchId)
        .eq("status", status),
    ),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Falha ao contar itens: ${error.message}`);
  return Object.fromEntries(
    statuses.map((status, index) => [status, results[index].count ?? 0]),
  ) as Record<(typeof statuses)[number], number>;
}
