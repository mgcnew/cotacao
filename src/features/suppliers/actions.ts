"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidCnpj, onlyDigits } from "@/features/company/cnpj";
import { requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Escritas de fornecedor.
 *
 * Permissões do schema: `supplier.create` para criar o fornecedor,
 * `supplier.update` para tudo o mais — inclusive contatos e categorias.
 *
 * Como no catálogo, `company_id` vem sempre de requireActiveCompany(), e
 * fornecedor não se apaga: muda de status. As cotações, pedidos e recebimentos
 * antigos continuam apontando para ele.
 */

export type SupplierFormState = { error: string | null };
export type ContactFormState = { error: string | null; savedAt?: number };

function describeWriteError(
  error: { code?: string; message: string },
  entity: string,
): string {
  if (error.code === "23505") {
    return `Já existe ${entity} com esses dados nesta empresa.`;
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "Seu papel não permite esta alteração em fornecedores.";
  }
  return `Não foi possível salvar: ${error.message}`;
}

const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do fornecedor" })
    .max(120, { error: "Nome muito longo" }),
  legalName: z
    .string()
    .trim()
    .max(160, { error: "Razão social muito longa" })
    .optional()
    .transform((v) => (v ? v : null)),
  documentNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? onlyDigits(v) : null))
    .refine((v) => v === null || isValidCnpj(v), {
      error: "CNPJ inválido — confira os dígitos",
    }),
  // Aceita "12.500,00": é como se digita valor em português.
  purchaseLimit: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      v ? Number(v.replace(/\./g, "").replace(",", ".")) : null,
    )
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
      error: "Limite de compras inválido",
    }),
  notes: z
    .string()
    .trim()
    .max(500, { error: "Observações muito longas" })
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const company = await requireActiveCompany();

  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    documentNumber: formData.get("documentNumber"),
    purchaseLimit: formData.get("purchaseLimit"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      company_id: company.companyId,
      name: parsed.data.name,
      legal_name: parsed.data.legalName,
      document_number: parsed.data.documentNumber,
      purchase_limit: parsed.data.purchaseLimit,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um fornecedor com este CNPJ nesta empresa." };
    }
    return { error: describeWriteError(error, "um fornecedor") };
  }

  revalidatePath("/fornecedores");
  // Vai direto para a ficha: sem contato, o fornecedor não recebe cotação.
  redirect(`/fornecedores/${data.id}`);
}

export async function setSupplierStatus(supplierId: string, status: string) {
  const company = await requireActiveCompany();

  if (!["active", "inactive", "blocked"].includes(status)) {
    throw new Error("Situação inválida");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ status })
    .eq("id", supplierId)
    .eq("company_id", company.companyId);

  if (error) throw new Error(describeWriteError(error, "um fornecedor"));

  revalidatePath("/fornecedores");
  revalidatePath(`/fornecedores/${supplierId}`);
}

const contactSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do contato" })
    .max(120, { error: "Nome muito longo" }),
  role: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : null)),
  // WhatsApp guardado só com dígitos: é assim que a API de envio consome.
  whatsapp: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? onlyDigits(v) : null))
    .refine((v) => v === null || (v.length >= 10 && v.length <= 13), {
      error: "WhatsApp deve ter DDD + número",
    }),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v : null)),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, {
      error: "E-mail inválido",
    }),
  isPrimary: z.boolean(),
});

export async function createSupplierContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const company = await requireActiveCompany();

  const parsed = contactSchema.safeParse({
    supplierId: formData.get("supplierId"),
    name: formData.get("name"),
    role: formData.get("role"),
    whatsapp: formData.get("whatsapp"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    isPrimary: formData.get("isPrimary") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (!parsed.data.whatsapp && !parsed.data.phone && !parsed.data.email) {
    return { error: "Informe ao menos um meio de contato." };
  }

  const supabase = await createServerSupabaseClient();

  // O schema tem índice único de um só principal ativo por fornecedor. Em vez
  // de deixar o insert falhar com 23505, rebaixamos o principal atual — é o
  // que a pessoa quer dizer ao marcar outro como principal.
  if (parsed.data.isPrimary) {
    const { error: demoteError } = await supabase
      .from("supplier_contacts")
      .update({ is_primary: false })
      .eq("company_id", company.companyId)
      .eq("supplier_id", parsed.data.supplierId)
      .eq("is_primary", true)
      .eq("is_active", true);

    if (demoteError) {
      return { error: describeWriteError(demoteError, "um contato") };
    }
  }

  const { error } = await supabase.from("supplier_contacts").insert({
    company_id: company.companyId,
    supplier_id: parsed.data.supplierId,
    name: parsed.data.name,
    role: parsed.data.role,
    whatsapp: parsed.data.whatsapp,
    phone: parsed.data.phone,
    email: parsed.data.email,
    is_primary: parsed.data.isPrimary,
  });

  if (error) {
    return { error: describeWriteError(error, "um contato") };
  }

  revalidatePath(`/fornecedores/${parsed.data.supplierId}`);
  revalidatePath("/fornecedores");
  return { error: null, savedAt: Date.now() };
}

export async function setContactActive(
  contactId: string,
  supplierId: string,
  isActive: boolean,
) {
  const company = await requireActiveCompany();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("supplier_contacts")
    // Contato desativado não pode continuar sendo o principal: o índice único
    // só considera principal ativo, e um inativo marcado confundiria a leitura.
    .update(isActive ? { is_active: true } : { is_active: false, is_primary: false })
    .eq("id", contactId)
    .eq("company_id", company.companyId);

  if (error) throw new Error(describeWriteError(error, "um contato"));

  revalidatePath(`/fornecedores/${supplierId}`);
  revalidatePath("/fornecedores");
}

/**
 * Liga ou desliga uma categoria do fornecedor.
 *
 * Aqui o DELETE é legítimo e existe policy para ele: a linha é só o vínculo,
 * não guarda histórico. Desfazer o vínculo é a operação correta.
 */
export async function toggleSupplierCategory(
  supplierId: string,
  categoryId: string,
  shouldLink: boolean,
) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { error } = shouldLink
    ? await supabase.from("supplier_categories").insert({
        company_id: company.companyId,
        supplier_id: supplierId,
        category_id: categoryId,
      })
    : await supabase
        .from("supplier_categories")
        .delete()
        .eq("company_id", company.companyId)
        .eq("supplier_id", supplierId)
        .eq("category_id", categoryId);

  if (error) throw new Error(describeWriteError(error, "esse vínculo"));

  revalidatePath(`/fornecedores/${supplierId}`);
}
