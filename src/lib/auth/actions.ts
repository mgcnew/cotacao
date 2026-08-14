"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTIVE_COMPANY_COOKIE, getMemberships } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthFormState = { error: string | null };

const credentialsSchema = z.object({
  email: z.email({ error: "Informe um e-mail válido" }),
  password: z.string().min(1, { error: "Informe a senha" }),
});

const signUpSchema = credentialsSchema.extend({
  password: z
    .string()
    .min(8, { error: "A senha deve ter ao menos 8 caracteres" }),
  fullName: z.string().trim().min(1, { error: "Informe seu nome" }),
});

/** Caminho interno seguro: evita open redirect via ?next=//site-externo */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica de propósito: não revelamos se o e-mail existe.
    return { error: "E-mail ou senha incorretos." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // O trigger on_auth_user_created lê full_name daqui para criar o profile.
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    return { error: error.message };
  }

  // Sem sessão => o projeto exige confirmação de e-mail.
  if (!data.session) {
    return {
      error:
        "Conta criada. Confirme o e-mail enviado para concluir o acesso.",
    };
  }

  // Cadastro só termina depois que a empresa existir.
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);

  redirect("/login");
}

/**
 * Troca a empresa ativa.
 *
 * Só grava o cookie se o usuário realmente tiver vínculo ativo na empresa —
 * o valor vem do cliente e não merece confiança.
 */
export async function setActiveCompany(companyId: string) {
  const memberships = await getMemberships();

  if (!memberships.some((m) => m.companyId === companyId)) {
    throw new Error("Empresa inválida para este usuário");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
