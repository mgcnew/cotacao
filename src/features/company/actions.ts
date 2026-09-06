"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidCnpj, onlyDigits } from "@/features/company/cnpj";
import {
  ACTIVE_COMPANY_COOKIE,
  getMemberships,
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type CreateCompanyState = { error: string | null };

const createCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da empresa" })
    .max(120, { error: "Nome muito longo" }),
  legalName: z
    .string()
    .trim()
    .max(160, { error: "Razão social muito longa" })
    .optional()
    .transform((v) => (v ? v : undefined)),
  documentNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? onlyDigits(v) : undefined))
    .refine((v) => v === undefined || isValidCnpj(v), {
      error: "CNPJ inválido — confira os dígitos",
    }),
});

/**
 * Cria a empresa do usuário recém-cadastrado.
 *
 * Roda com service_role, que ignora RLS — então a autorização é feita aqui,
 * explicitamente:
 *  1. exige sessão válida (requireUser valida no servidor de auth);
 *  2. usa o id do PRÓPRIO usuário logado, nunca um id vindo do formulário;
 *  3. recusa se o usuário já pertence a alguma empresa, para que este caminho
 *     sirva só ao onboarding. Criar empresas adicionais é ação administrativa
 *     de dentro do app, com suas próprias regras.
 *
 * A criação em si continua sendo do banco: o wrapper apenas delega para
 * private.provision_company, que monta papéis, permissões, unidades e vínculo.
 */
export async function createCompany(
  _prev: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const user = await requireUser();

  const existing = await getMemberships();
  if (existing.length > 0) {
    return {
      error: "Sua conta já está vinculada a uma empresa.",
    };
  }

  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    documentNumber: formData.get("documentNumber"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (cause) {
    // Falta de configuração é problema de ambiente, não do que o usuário digitou.
    // O motivo real vai para o log do servidor: sem isso, qualquer falha aqui
    // vira "falta a chave" e a investigação começa pela pista errada.
    console.error("[createCompany] createServiceRoleClient falhou:", cause);

    const missingKey =
      cause instanceof Error && cause.message.includes("SUPABASE_SECRET_KEY");

    return {
      error: missingKey
        ? "O servidor está sem a chave de administração do Supabase (SUPABASE_SECRET_KEY). Configure o .env.local e reinicie a aplicação."
        : "Falha ao preparar a conexão administrativa com o Supabase. Verifique o log do servidor.",
    };
  }

  const { data, error } = await supabase.rpc("rpc_service_provision_company", {
    p_owner_user_id: user.id,
    p_name: parsed.data.name,
    p_legal_name: parsed.data.legalName ?? undefined,
    p_document_number: parsed.data.documentNumber ?? undefined,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma empresa cadastrada com este CNPJ." };
    }
    return { error: `Não foi possível criar a empresa: ${error.message}` };
  }

  // Deixa a empresa recém-criada como ativa na sessão.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, data as unknown as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type UpdateCompanyProfileState = {
  ok: boolean;
  error: string | null;
};

const COMPANY_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

const updateCompanyProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da empresa" })
    .max(120, { error: "Nome muito longo" }),
  legalName: z
    .string()
    .trim()
    .max(160, { error: "Razão social muito longa" })
    .optional()
    .transform((value) => value || undefined),
  documentNumber: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : undefined))
    .refine((value) => value === undefined || isValidCnpj(value), {
      error: "CNPJ inválido — confira os dígitos",
    }),
  timezone: z.enum(COMPANY_TIMEZONES, {
    error: "Selecione um fuso horário válido",
  }),
});

const LOGO_MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Atualiza somente a empresa ativa; nenhum id controlado pelo cliente entra. */
export async function updateCompanyProfile(
  _prev: UpdateCompanyProfileState,
  formData: FormData,
): Promise<UpdateCompanyProfileState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("role.manage")) {
    return { ok: false, error: "Seu perfil não pode alterar esta empresa." };
  }

  const parsed = updateCompanyProfileSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    documentNumber: formData.get("documentNumber"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const documentChanged =
    (parsed.data.documentNumber ?? null) !== company.companyDocumentNumber;
  if (documentChanged && formData.get("confirmDocumentChange") !== "on") {
    return {
      ok: false,
      error: "Confirme a alteração do CNPJ antes de salvar.",
    };
  }

  const removeLogo = formData.get("removeLogo") === "on";
  const logoEntry = formData.get("logo");
  const logo =
    !removeLogo && logoEntry instanceof File && logoEntry.size > 0
      ? logoEntry
      : null;

  if (logo && !LOGO_MIME_EXTENSION[logo.type]) {
    return { ok: false, error: "Use uma imagem JPG, PNG ou WebP." };
  }
  if (logo && logo.size > 2 * 1024 * 1024) {
    return { ok: false, error: "A imagem deve ter no máximo 2 MB." };
  }

  const supabase = await createServerSupabaseClient();
  let nextLogoPath = removeLogo ? null : company.companyLogoPath;
  let uploadedLogoPath: string | null = null;

  if (logo) {
    const extension = LOGO_MIME_EXTENSION[logo.type];
    uploadedLogoPath = `${company.companyId}/logo-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("company-assets")
      .upload(uploadedLogoPath, new Uint8Array(await logo.arrayBuffer()), {
        contentType: logo.type,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return {
        ok: false,
        error: `Não foi possível enviar o logotipo: ${uploadError.message}`,
      };
    }
    nextLogoPath = uploadedLogoPath;
  }

  const { error } = await supabase.rpc("rpc_update_company_profile", {
    p_company_id: company.companyId,
    p_name: parsed.data.name,
    p_legal_name: parsed.data.legalName ?? null,
    p_document_number: parsed.data.documentNumber ?? null,
    p_timezone: parsed.data.timezone,
    p_logo_path: nextLogoPath,
  });

  if (error) {
    if (uploadedLogoPath) {
      await supabase.storage.from("company-assets").remove([uploadedLogoPath]);
    }
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Já existe uma empresa cadastrada com este CNPJ."
          : `Não foi possível atualizar a empresa: ${error.message}`,
    };
  }

  if (company.companyLogoPath && company.companyLogoPath !== nextLogoPath) {
    await supabase.storage
      .from("company-assets")
      .remove([company.companyLogoPath]);
  }

  revalidatePath("/", "layout");
  revalidatePath("/configuracoes");
  return { ok: true, error: null };
}
