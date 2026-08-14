import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCompany(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, legal_name, document_number, currency_code, timezone, status, created_at",
    )
    .eq("id", companyId)
    .single();

  if (error) throw new Error(`Falha ao carregar empresa: ${error.message}`);
  return data;
}

/** Papéis da empresa com a contagem de permissões de cada um. */
export async function listRoles(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description, is_system, role_permissions ( permission_id )")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`Falha ao carregar papéis: ${error.message}`);

  return (data ?? []).map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.is_system,
    permissionCount: role.role_permissions?.length ?? 0,
  }));
}

/**
 * Membros da empresa.
 *
 * Não há FK entre company_members e profiles — ambas apontam para auth.users —
 * então o join precisa ser feito aqui, buscando os profiles à parte.
 *
 * Limitação conhecida do schema: a policy `profiles_select_self` só permite ler
 * o próprio profile, então o nome dos demais membros volta nulo. Corrigir isso
 * exigiria uma policy permitindo ler profiles de quem compartilha empresa —
 * mudança de schema, portanto fora do escopo sem aprovação.
 */
export async function listMembers(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("company_members")
    .select("id, user_id, status, joined_at, roles!inner ( name )")
    .eq("company_id", companyId);

  if (error) throw new Error(`Falha ao carregar membros: ${error.message}`);

  const members = data ?? [];
  if (members.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      members.map((m) => m.user_id),
    );

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );

  return members.map((m) => ({
    id: m.id,
    status: m.status,
    joinedAt: m.joined_at,
    roleName: m.roles?.name ?? null,
    fullName: nameById.get(m.user_id) ?? null,
  }));
}

/** Catálogo global de permissões, agrupado por módulo. */
export async function listPermissionCatalog() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("key, module, action, description")
    .order("module")
    .order("action");

  if (error) throw new Error(`Falha ao carregar permissões: ${error.message}`);

  const byModule = new Map<string, typeof data>();
  for (const perm of data ?? []) {
    const list = byModule.get(perm.module) ?? [];
    list.push(perm);
    byModule.set(perm.module, list);
  }
  return byModule;
}
