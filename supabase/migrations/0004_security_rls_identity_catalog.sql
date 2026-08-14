-- 0004_security_rls_identity_catalog.sql
-- Segurança multiempresa + permissões para migrations 0001–0003.
--
-- Premissas:
-- - RLS já está habilitado nas tabelas criadas anteriormente.
-- - `private` NÃO será adicionado aos schemas expostos pela Data API.
-- - Funções SECURITY DEFINER usam search_path vazio e referências qualificadas.

begin;

-- ============================================================
-- FUNÇÕES AUXILIARES DE AUTORIZAÇÃO
-- ============================================================

create or replace function private.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

create or replace function private.current_company_member_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.id
  from public.company_members cm
  where cm.company_id = target_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1;
$$;

create or replace function private.has_permission(
  target_company_id uuid,
  permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select cm.id, cm.role_id
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
    limit 1
  ),
  perm as (
    select p.id
    from public.permissions p
    where p.key = permission_key
    limit 1
  ),
  override_effect as (
    select mpo.effect
    from public.member_permission_overrides mpo
    join member m on m.id = mpo.company_member_id
    join perm p on p.id = mpo.permission_id
    limit 1
  ),
  role_grant as (
    select exists (
      select 1
      from public.role_permissions rp
      join member m on m.role_id = rp.role_id
      join perm p on p.id = rp.permission_id
    ) as granted
  )
  select
    case
      when not exists (select 1 from member) then false
      when exists (
        select 1 from override_effect where effect = 'deny'
      ) then false
      when exists (
        select 1 from override_effect where effect = 'allow'
      ) then true
      else coalesce((select granted from role_grant), false)
    end;
$$;

comment on function private.is_company_member(uuid)
is 'Retorna true quando auth.uid() possui membership ativo na empresa.';

comment on function private.current_company_member_id(uuid)
is 'Retorna o company_member ativo do usuário autenticado para a empresa.';

comment on function private.has_permission(uuid, text)
is 'Autoriza por membership + override deny/allow + permissões do papel.';

-- O schema privado continua fora da Data API, mas authenticated precisa
-- USAGE para que policies possam chamar as funções explicitamente.
grant usage on schema private to authenticated;

revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.current_company_member_id(uuid) from public;
revoke all on function private.has_permission(uuid, text) from public;

grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.current_company_member_id(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;

-- Nenhuma dessas funções deve ser chamada por anon.
revoke execute on function private.is_company_member(uuid) from anon;
revoke execute on function private.current_company_member_id(uuid) from anon;
revoke execute on function private.has_permission(uuid, text) from anon;

-- ============================================================
-- GRANTS DE OBJETO
-- RLS continuará determinando as linhas acessíveis.
-- ============================================================

-- Por padrão, anon não acessa as tabelas operacionais desta etapa.
-- Revogação explícita evita afetar objetos não pertencentes ao sistema.
revoke all on public.companies from anon;
revoke all on public.profiles from anon;
revoke all on public.roles from anon;
revoke all on public.permissions from anon;
revoke all on public.company_members from anon;
revoke all on public.role_permissions from anon;
revoke all on public.member_permission_overrides from anon;
revoke all on public.categories from anon;
revoke all on public.units from anon;
revoke all on public.products from anon;
revoke all on public.product_attribute_definitions from anon;
revoke all on public.product_attribute_values from anon;

-- authenticated alcança somente as operações que poderão ser filtradas
-- por RLS. Policies ainda decidem se a ação é permitida.
grant select on public.companies to authenticated;
grant select, update on public.profiles to authenticated;

grant select, insert, update on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update on public.company_members to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.member_permission_overrides to authenticated;

grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.units to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.product_attribute_definitions to authenticated;
grant select, insert, update, delete on public.product_attribute_values to authenticated;

-- ============================================================
-- POLICIES: PROFILES
-- ============================================================

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ============================================================
-- POLICIES: COMPANIES
-- ============================================================

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies
for select
to authenticated
using ((select private.is_company_member(id)));

-- Não haverá INSERT/UPDATE direto de company por usuário comum nesta fase.
-- Provisionamento e alterações estruturais deverão usar operação server-side.

-- ============================================================
-- POLICIES: COMPANY MEMBERS
-- ============================================================

drop policy if exists company_members_select_same_company on public.company_members;
create policy company_members_select_same_company
on public.company_members
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists company_members_insert_manage on public.company_members;
create policy company_members_insert_manage
on public.company_members
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'company_member.invite'))
);

drop policy if exists company_members_update_manage on public.company_members;
create policy company_members_update_manage
on public.company_members
for update
to authenticated
using (
  (select private.has_permission(company_id, 'company_member.update'))
)
with check (
  (select private.has_permission(company_id, 'company_member.update'))
);

-- DELETE físico intencionalmente não concedido.

-- ============================================================
-- POLICIES: ROLES
-- ============================================================

drop policy if exists roles_select_member on public.roles;
create policy roles_select_member
on public.roles
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists roles_insert_manage on public.roles;
create policy roles_insert_manage
on public.roles
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'role.manage'))
);

drop policy if exists roles_update_manage on public.roles;
create policy roles_update_manage
on public.roles
for update
to authenticated
using (
  (select private.has_permission(company_id, 'role.manage'))
)
with check (
  (select private.has_permission(company_id, 'role.manage'))
);

-- ============================================================
-- POLICIES: PERMISSIONS
-- Catálogo global somente leitura para usuários autenticados.
-- ============================================================

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (true);

-- ============================================================
-- POLICIES: ROLE PERMISSIONS
-- A empresa é derivada do role relacionado.
-- ============================================================

drop policy if exists role_permissions_select_member on public.role_permissions;
create policy role_permissions_select_member
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (select private.is_company_member(r.company_id))
  )
);

drop policy if exists role_permissions_insert_manage on public.role_permissions;
create policy role_permissions_insert_manage
on public.role_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (select private.has_permission(r.company_id, 'role.manage'))
  )
);

drop policy if exists role_permissions_delete_manage on public.role_permissions;
create policy role_permissions_delete_manage
on public.role_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (select private.has_permission(r.company_id, 'role.manage'))
  )
);

-- ============================================================
-- POLICIES: MEMBER PERMISSION OVERRIDES
-- Empresa é derivada do company_member relacionado.
-- ============================================================

drop policy if exists member_permission_overrides_select_member
on public.member_permission_overrides;
create policy member_permission_overrides_select_member
on public.member_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.id = member_permission_overrides.company_member_id
      and (select private.is_company_member(cm.company_id))
  )
);

drop policy if exists member_permission_overrides_insert_manage
on public.member_permission_overrides;
create policy member_permission_overrides_insert_manage
on public.member_permission_overrides
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.id = member_permission_overrides.company_member_id
      and (select private.has_permission(cm.company_id, 'permission_override.manage'))
  )
);

drop policy if exists member_permission_overrides_update_manage
on public.member_permission_overrides;
create policy member_permission_overrides_update_manage
on public.member_permission_overrides
for update
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.id = member_permission_overrides.company_member_id
      and (select private.has_permission(cm.company_id, 'permission_override.manage'))
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.id = member_permission_overrides.company_member_id
      and (select private.has_permission(cm.company_id, 'permission_override.manage'))
  )
);

drop policy if exists member_permission_overrides_delete_manage
on public.member_permission_overrides;
create policy member_permission_overrides_delete_manage
on public.member_permission_overrides
for delete
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.id = member_permission_overrides.company_member_id
      and (select private.has_permission(cm.company_id, 'permission_override.manage'))
  )
);

-- ============================================================
-- POLICIES: CATEGORIES
-- ============================================================

drop policy if exists categories_select_member on public.categories;
create policy categories_select_member
on public.categories
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists categories_insert_create on public.categories;
create policy categories_insert_create
on public.categories
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'product.create'))
);

drop policy if exists categories_update_update on public.categories;
create policy categories_update_update
on public.categories
for update
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
);

-- ============================================================
-- POLICIES: UNITS
-- Unidades são configuração de catálogo.
-- ============================================================

drop policy if exists units_select_member on public.units;
create policy units_select_member
on public.units
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists units_insert_manage on public.units;
create policy units_insert_manage
on public.units
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'product.create'))
);

drop policy if exists units_update_manage on public.units;
create policy units_update_manage
on public.units
for update
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
);

-- ============================================================
-- POLICIES: PRODUCTS
-- ============================================================

drop policy if exists products_select_member on public.products;
create policy products_select_member
on public.products
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists products_insert_create on public.products;
create policy products_insert_create
on public.products
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'product.create'))
);

drop policy if exists products_update_update on public.products;
create policy products_update_update
on public.products
for update
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
);

-- ============================================================
-- POLICIES: PRODUCT ATTRIBUTE DEFINITIONS
-- ============================================================

drop policy if exists product_attribute_definitions_select_member
on public.product_attribute_definitions;
create policy product_attribute_definitions_select_member
on public.product_attribute_definitions
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists product_attribute_definitions_insert_manage
on public.product_attribute_definitions;
create policy product_attribute_definitions_insert_manage
on public.product_attribute_definitions
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'product.update'))
);

drop policy if exists product_attribute_definitions_update_manage
on public.product_attribute_definitions;
create policy product_attribute_definitions_update_manage
on public.product_attribute_definitions
for update
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
);

-- ============================================================
-- POLICIES: PRODUCT ATTRIBUTE VALUES
-- ============================================================

drop policy if exists product_attribute_values_select_member
on public.product_attribute_values;
create policy product_attribute_values_select_member
on public.product_attribute_values
for select
to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists product_attribute_values_insert_manage
on public.product_attribute_values;
create policy product_attribute_values_insert_manage
on public.product_attribute_values
for insert
to authenticated
with check (
  (select private.has_permission(company_id, 'product.update'))
);

drop policy if exists product_attribute_values_update_manage
on public.product_attribute_values;
create policy product_attribute_values_update_manage
on public.product_attribute_values
for update
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
);

drop policy if exists product_attribute_values_delete_manage
on public.product_attribute_values;
create policy product_attribute_values_delete_manage
on public.product_attribute_values
for delete
to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
);

commit;
