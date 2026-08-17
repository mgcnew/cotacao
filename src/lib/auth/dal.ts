import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Data Access Layer de autenticação e tenant.
 *
 * Toda decisão de "quem é o usuário" e "em qual empresa ele está" passa por
 * aqui. As funções são memoizadas com `cache()` do React, então repetir a
 * chamada em vários Server Components do mesmo render custa uma consulta só.
 *
 * Isto NÃO substitui a segurança do banco: RLS e as RPCs continuam sendo a
 * última palavra. O que está aqui serve para decidir navegação e o que
 * renderizar — nunca para liberar dado que o banco negaria.
 *
 * COMO A SESSÃO É VERIFICADA
 *
 * Com `getClaims()`, e não com `getUser()`. A diferença é medida: `getUser()`
 * vai até o servidor de auth do Supabase e custava 223 ms por render, mais
 * outros 297 ms no proxy, que faz a mesma pergunta. `getClaims()` verifica a
 * assinatura do token no próprio processo — este projeto usa chaves
 * assimétricas (ES256), e o JWKS é buscado uma vez e fica em cache.
 *
 * A garantia é criptográfica, não menor: assinatura conferida com a chave
 * pública do projeto e `exp` validado. O que se perde é detectar, no meio da
 * validade do token, uma sessão revogada do outro lado — quem precisar dessa
 * garantia usa `getAuthUser()`, que pergunta ao servidor.
 */

export type CompanyMembership = {
  companyId: string;
  companyName: string;
  companyStatus: string;
  memberId: string;
  roleId: string;
  roleName: string;
};

/**
 * O que se sabe do usuário pelo próprio token.
 *
 * `id` e `email` são tudo o que o app usa. Quem precisar do registro completo
 * (metadados, confirmações, banimento) chama `getAuthUser()`.
 */
export type SessionUser = { id: string; email: string | null };

/** Sessão verificada localmente, ou `null` quando não há token válido. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient();

  // Sem argumento, getClaims usa a sessão dos cookies — e renova o token
  // quando ele já expirou, que é o que mantém a sessão viva.
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;

  if (error || !sub) return null;

  const email = data.claims.email;
  return { id: sub, email: typeof email === "string" ? email : null };
});

/** Igual ao acima, exigindo sessão: sem ela, manda para o login. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
});

/**
 * O registro completo do usuário, perguntado ao servidor de auth.
 *
 * Custa uma ida à rede. Use só quando a resposta do servidor for necessária —
 * para saber "quem é", o token já basta e é local.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Empresas em que o usuário tem vínculo ativo.
 * A RLS de company_members já limita o resultado ao próprio usuário.
 */
export const getMemberships = cache(async (): Promise<CompanyMembership[]> => {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("company_members")
    .select(
      `
      id,
      company_id,
      role_id,
      companies!inner ( name, status ),
      roles!inner ( name )
    `,
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    throw new Error(`Falha ao carregar empresas do usuário: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    companyId: row.company_id,
    companyName: row.companies.name,
    companyStatus: row.companies.status,
    memberId: row.id,
    roleId: row.role_id,
    roleName: row.roles.name,
  }));
});

/**
 * Empresa ativa da sessão.
 *
 * A escolha vem do cookie, mas nunca confiamos nele: só vale se o usuário
 * realmente tiver vínculo ativo naquela empresa. Cookie adulterado cai no
 * fallback da primeira empresa legítima.
 */
export const getActiveCompany = cache(
  async (): Promise<CompanyMembership | null> => {
    const memberships = await getMemberships();
    if (memberships.length === 0) return null;

    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const preferred = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

    const chosen = preferred
      ? memberships.find((m) => m.companyId === preferred)
      : undefined;

    return chosen ?? memberships[0];
  },
);

/** Empresa ativa, exigindo que exista. Sem empresa, manda provisionar uma. */
export const requireActiveCompany = cache(
  async (): Promise<CompanyMembership> => {
    const company = await getActiveCompany();
    if (!company) {
      redirect("/onboarding");
    }
    return company;
  },
);

export const ACTIVE_COMPANY_COOKIE = "cotacao.company";

/**
 * Permissões efetivas do usuário na empresa ativa.
 *
 * Reproduz a mesma regra de `private.has_permission`: papel + overrides, com
 * `deny` vencendo `allow`. Serve para a UI decidir o que mostrar. A decisão
 * final continua no banco — o botão escondido é cortesia, não segurança.
 */
export const getPermissions = cache(
  async (companyId: string): Promise<Set<string>> => {
    const supabase = await createServerSupabaseClient();
    const memberships = await getMemberships();
    const membership = memberships.find((m) => m.companyId === companyId);

    if (!membership) return new Set();

    const [rolePerms, overrides] = await Promise.all([
      supabase
        .from("role_permissions")
        .select("permissions!inner ( key )")
        .eq("role_id", membership.roleId),
      supabase
        .from("member_permission_overrides")
        .select("effect, permissions!inner ( key )")
        .eq("company_member_id", membership.memberId),
    ]);

    if (rolePerms.error) {
      throw new Error(
        `Falha ao carregar permissões do papel: ${rolePerms.error.message}`,
      );
    }
    if (overrides.error) {
      throw new Error(
        `Falha ao carregar exceções de permissão: ${overrides.error.message}`,
      );
    }

    const keys = new Set(
      (rolePerms.data ?? []).map((row) => row.permissions.key),
    );

    for (const row of overrides.data ?? []) {
      if (row.effect === "allow") keys.add(row.permissions.key);
      else keys.delete(row.permissions.key);
    }

    return keys;
  },
);
