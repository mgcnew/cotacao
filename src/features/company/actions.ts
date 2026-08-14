"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidCnpj, onlyDigits } from "@/features/company/cnpj";
import { ACTIVE_COMPANY_COOKIE, getMemberships, requireUser } from "@/lib/auth/dal";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type CreateCompanyState = { error: string | null };

const schema = z.object({
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

  const parsed = schema.safeParse({
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
