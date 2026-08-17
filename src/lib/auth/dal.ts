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
  /** Permissões efetivas nesta empresa, já com os overrides aplicados. */
  permissions: string[];
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
 * Empresas em que o usuário tem vínculo ativo, com as permissões de cada uma.
 *
 * Uma ida ao banco, não três. Antes eram `company_members` e, EM CADEIA,
 * `role_permissions` + `member_permission_overrides` — em cadeia porque as
 * permissões precisam do papel e do membro que vêm do vínculo. Medido em
 * produção: 261 ms + 366 ms por render. A conta é do Postgres em microssegundos;
 * o custo era a rede, três vezes.
 *
 * `requireUser` vem antes de propósito: sem sessão, a RPC devolveria zero
 * linhas e a pessoa acabaria no onboarding em vez do login. E agora é local,
 * então não custa ida nenhuma.
 */
export const getMemberships = cache(async (): Promise<CompanyMembership[]> => {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("rpc_session_context");

  if (error) {
    throw new Error(`Falha ao carregar empresas do usuário: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    companyId: row.company_id,
    companyName: row.company_name,
    companyStatus: row.company_status,
    memberId: row.member_id,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: row.permissions ?? [],
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
 * Não consulta nada: vem do mesmo contexto de sessão já carregado. A regra —
 * papel mais overrides, com `deny` vencendo `allow` — mora agora em
 * `rpc_session_context`, junto de `private.has_permission`, que é quem de fato
 * autoriza. Antes estava reescrita aqui em TypeScript, e duas implementações da
 * mesma regra envelhecem em ritmos diferentes.
 *
 * Serve para a UI decidir o que mostrar. A decisão final continua no banco — o
 * botão escondido é cortesia, não segurança.
 */
export const getPermissions = cache(
  async (companyId: string): Promise<Set<string>> => {
    const memberships = await getMemberships();
    const membership = memberships.find((m) => m.companyId === companyId);
    return new Set(membership?.permissions ?? []);
  },
);
