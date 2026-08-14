import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listSuppliers(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select(
      `
      id,
      name,
      legal_name,
      document_number,
      status,
      purchase_limit,
      supplier_contacts ( id, name, phone, whatsapp, is_primary, is_active )
    `,
    )
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return data ?? [];
}

export async function getSupplier(companyId: string, supplierId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, legal_name, document_number, status, purchase_limit, notes",
    )
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar fornecedor: ${error.message}`);
  return data;
}

export async function listSupplierContacts(
  companyId: string,
  supplierId: string,
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, name, role, whatsapp, phone, email, is_primary, is_active")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    // Principal ativo primeiro: é quem recebe a cotação.
    .order("is_active", { ascending: false })
    .order("is_primary", { ascending: false })
    .order("name");

  if (error) throw new Error(`Falha ao listar contatos: ${error.message}`);
  return data ?? [];
}

/** Ids das categorias que o fornecedor atende. */
export async function listSupplierCategoryIds(
  companyId: string,
  supplierId: string,
): Promise<Set<string>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_categories")
    .select("category_id")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);

  if (error) {
    throw new Error(`Falha ao listar categorias do fornecedor: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.category_id));
}

export async function getSupplierCounts(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const [total, ativos, contatos] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("supplier_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  return {
    total: total.count ?? 0,
    ativos: ativos.count ?? 0,
    contatos: contatos.count ?? 0,
  };
}
