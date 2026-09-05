import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listSuppliers(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const [suppliers, notices] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        `
        id,
        name,
        legal_name,
        document_number,
        status,
        purchase_limit,
        supplier_contacts ( id, name, phone, whatsapp, is_primary, is_active ),
        supplier_categories (
          category_id,
          categories!supplier_categories_company_id_category_id_fkey ( name )
        )
      `,
      )
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("supplier_notices")
      .select("supplier_id, priority")
      .eq("company_id", companyId)
      .eq("status", "open"),
  ]);

  if (suppliers.error) {
    throw new Error(`Falha ao listar fornecedores: ${suppliers.error.message}`);
  }
  if (notices.error) {
    throw new Error(`Falha ao listar avisos: ${notices.error.message}`);
  }

  const noticeSummary = new Map<
    string,
    { openNoticeCount: number; hasImportantNotice: boolean }
  >();
  for (const notice of notices.data ?? []) {
    const current = noticeSummary.get(notice.supplier_id) ?? {
      openNoticeCount: 0,
      hasImportantNotice: false,
    };
    current.openNoticeCount += 1;
    current.hasImportantNotice ||= notice.priority === "high";
    noticeSummary.set(notice.supplier_id, current);
  }

  return (suppliers.data ?? []).map((supplier) => ({
    ...supplier,
    ...(noticeSummary.get(supplier.id) ?? {
      openNoticeCount: 0,
      hasImportantNotice: false,
    }),
  }));
}

export async function getSupplier(companyId: string, supplierId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, legal_name, document_number, status, purchase_limit, notes, supplier_legal_entities ( id, document_number, legal_name, is_primary, is_active )",
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

export async function listSupplierNotices(
  companyId: string,
  supplierId: string,
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_notices")
    .select(
      "id, kind, title, description, amount, due_date, priority, status, resolution_note, created_by_name, resolved_by_name, resolved_at, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .order("status", { ascending: true })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar avisos do fornecedor: ${error.message}`);
  }
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
