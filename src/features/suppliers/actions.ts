"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidCnpj, onlyDigits } from "@/features/company/cnpj";
import { requireActiveCompany } from "@/lib/auth/dal";
import { normalizeEntityName } from "@/lib/entity-name";
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

/**
 * O estado devolve os valores junto com o erro — e isso não é capricho.
 *
 * `<form action={fn}>` com Server Action reseta os campos não controlados
 * depois de submeter, inclusive quando a action recusa. Num formulário de dez
 * campos isso significa perder tudo por causa de um CNPJ com um dígito errado.
 * Devolvendo o que foi digitado, a tela os repõe como `defaultValue`.
 */
export type SupplierFormState = {
  error: string | null;
  savedId?: string;
  valores?: Record<string, string>;
  /**
   * Muda a cada resposta, mesmo quando o erro é o mesmo de antes.
   *
   * É o que a tela usa como `key` para remontar o formulário: `defaultValue`
   * não mexe em campo já montado, então repor o digitado exige remontagem — e
   * errar duas vezes o mesmo CNPJ tem que repor nas duas.
   */
  respondidoEm?: number;
};
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

/**
 * Cadastra o fornecedor e, na mesma transação, o primeiro contato.
 *
 * Eram dois momentos: gravava a empresa, redirecionava para a ficha e só lá
 * pedia o contato. Nada obrigava a concluir — e fornecedor sem contato ativo
 * não aparece em `listSelectableSuppliers`, ou seja, não pode ser convidado
 * para rodada nenhuma. O fluxo partido convidava a esse estado, em silêncio.
 *
 * A RPC da 0036 grava os dois de uma vez: ou existem os dois, ou nenhum. O
 * contato continua opcional, porque comprar no balcão é legítimo; o que mudou
 * é que agora dá para preencher tudo sem trocar de tela.
 */
/** O que a pessoa digitou, para repor na tela quando a gravação é recusada. */
function digitados(formData: FormData): Record<string, string> {
  const campos = [
    "name",
    "legalName",
    "documentNumber",
    "purchaseLimit",
    "notes",
    "contactName",
    "contactRole",
    "contactWhatsapp",
    "contactPhone",
    "contactEmail",
  ];
  return Object.fromEntries(
    campos.map((c) => [c, String(formData.get(c) ?? "")]),
  );
}

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
    return {
      error: parsed.error.issues[0].message,
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }

  const contatoNome = String(formData.get("contactName") ?? "").trim();
  const contatoWhats = String(formData.get("contactWhatsapp") ?? "").trim();
  const contatoFone = String(formData.get("contactPhone") ?? "").trim();
  const contatoEmail = String(formData.get("contactEmail") ?? "").trim();

  // A RPC também recusa, mas dizer aqui evita a ida ao banco e devolve a frase
  // no idioma da tela em vez do erro do Postgres.
  if (contatoNome && !contatoWhats && !contatoFone && !contatoEmail) {
    return {
      error: "Informe ao menos um meio de contato.",
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }
  if (!contatoNome && (contatoWhats || contatoFone || contatoEmail)) {
    return {
      error: "Informe o nome do contato.",
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: supplierWithName, error: nameReadError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("normalized_name", normalizeEntityName(parsed.data.name))
    .limit(1)
    .maybeSingle();

  if (nameReadError) {
    return {
      error: `Não foi possível verificar o nome do fornecedor: ${nameReadError.message}`,
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }
  if (supplierWithName) {
    return {
      error: "Já existe um fornecedor com este nome nesta empresa.",
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }

  const { data, error } = await supabase.rpc(
    "rpc_create_supplier_with_contact",
    {
      p_company_id: company.companyId,
      p_name: parsed.data.name,
      // O schema normaliza campo vazio para `null`; a RPC tem default, então
      // `undefined` é o jeito de dizer "não passe este argumento".
      p_legal_name: parsed.data.legalName ?? undefined,
      p_document_number: parsed.data.documentNumber ?? undefined,
      p_purchase_limit: parsed.data.purchaseLimit ?? undefined,
      p_notes: parsed.data.notes ?? undefined,
      p_contact_name: contatoNome || undefined,
      p_contact_role:
        String(formData.get("contactRole") ?? "").trim() || undefined,
      p_contact_whatsapp: contatoWhats || undefined,
      p_contact_phone: contatoFone || undefined,
      p_contact_email: contatoEmail || undefined,
    },
  );

  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("nome")
          ? "Já existe um fornecedor com este nome nesta empresa."
          : "Já existe um fornecedor com este CNPJ nesta empresa.",
        valores: digitados(formData),
        respondidoEm: Date.now(),
      };
    }
    return {
      error: describeWriteError(error, "um fornecedor"),
      valores: digitados(formData),
      respondidoEm: Date.now(),
    };
  }

  revalidatePath("/fornecedores");
  if (formData.get("apos") === "fechar") {
    return { error: null, savedId: data };
  }
  redirect(`/fornecedores/${data}`);
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
    .update(
      isActive ? { is_active: true } : { is_active: false, is_primary: false },
    )
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
