-- 0098_company_profile.sql
-- Perfil editável da empresa e logotipo público.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-assets',
  'company-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_select_member on storage.objects;
create policy company_assets_select_member
on storage.objects for select to authenticated
using (
  bucket_id = 'company-assets'
  and (select private.is_company_member(
    ((storage.foldername(name))[1])::uuid
  ))
);

drop policy if exists company_assets_insert_manage on storage.objects;
create policy company_assets_insert_manage
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-assets'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid,
    'role.manage'
  ))
);

drop policy if exists company_assets_delete_manage on storage.objects;
create policy company_assets_delete_manage
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-assets'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid,
    'role.manage'
  ))
);

create or replace function public.rpc_update_company_profile(
  p_company_id uuid,
  p_name text,
  p_legal_name text default null,
  p_document_number text default null,
  p_timezone text default 'America/Sao_Paulo',
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_legal_name text;
  v_document text;
  v_timezone text;
  v_logo_path text;
begin
  perform private.require_permission(p_company_id, 'role.manage');

  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_legal_name := nullif(trim(coalesce(p_legal_name, '')), '');
  v_document := nullif(
    pg_catalog.regexp_replace(coalesce(p_document_number, ''::text), '\D', '', 'g'),
    ''
  );
  v_timezone := nullif(trim(coalesce(p_timezone, '')), '');
  v_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');

  if v_name is null or length(v_name) > 120 then
    raise exception 'Nome da empresa inválido';
  end if;

  if v_legal_name is not null and length(v_legal_name) > 160 then
    raise exception 'Razão social muito longa';
  end if;

  if v_document is not null and length(v_document) <> 14 then
    raise exception 'CNPJ deve ter 14 dígitos';
  end if;

  if v_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names zone
    where zone.name = v_timezone
  ) then
    raise exception 'Fuso horário inválido';
  end if;

  if v_logo_path is not null
     and not pg_catalog.starts_with(v_logo_path, p_company_id::text || '/') then
    raise exception 'Caminho do logotipo inválido';
  end if;

  update public.companies
  set
    name = v_name,
    legal_name = v_legal_name,
    document_number = v_document,
    timezone = v_timezone,
    logo_path = v_logo_path
  where id = p_company_id;

  if not found then
    raise exception 'Empresa não encontrada';
  end if;

  perform private.emit_domain_event(
    p_company_id,
    'company.profile_updated',
    'company',
    p_company_id,
    pg_catalog.jsonb_build_object('has_logo', v_logo_path is not null)
  );

  return pg_catalog.jsonb_build_object(
    'id', p_company_id,
    'name', v_name,
    'logo_path', v_logo_path
  );
end;
$$;

revoke all on function public.rpc_update_company_profile(
  uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.rpc_update_company_profile(
  uuid, text, text, text, text, text
) to authenticated;

-- O menu da empresa precisa desses dados sem acrescentar outra viagem ao
-- banco em todo render do layout. O contexto de sessão continua retornando
-- uma linha por empresa, agora com seu perfil visual e fiscal.
drop function if exists public.rpc_session_context();

create function public.rpc_session_context()
returns table (
  company_id uuid,
  company_name text,
  company_legal_name text,
  company_document_number text,
  company_logo_path text,
  company_timezone text,
  company_status text,
  member_id uuid,
  role_id uuid,
  role_name text,
  permissions text[]
)
language sql
stable
set search_path = ''
as $$
  select
    cm.company_id,
    c.name as company_name,
    c.legal_name as company_legal_name,
    c.document_number as company_document_number,
    c.logo_path as company_logo_path,
    c.timezone as company_timezone,
    c.status as company_status,
    cm.id as member_id,
    cm.role_id,
    r.name as role_name,
    coalesce(
      (
        select array_agg(p.key order by p.key)
        from public.permissions p
        where coalesce(
          (
            select case mpo.effect when 'allow' then true else false end
            from public.member_permission_overrides mpo
            where mpo.company_member_id = cm.id
              and mpo.permission_id = p.id
            limit 1
          ),
          exists (
            select 1
            from public.role_permissions rp
            where rp.role_id = cm.role_id
              and rp.permission_id = p.id
          )
        )
      ),
      '{}'::text[]
    ) as permissions
  from public.company_members cm
  join public.companies c
    on c.id = cm.company_id
  join public.roles r
    on r.id = cm.role_id
   and r.company_id = cm.company_id
  where cm.user_id = (select auth.uid())
    and cm.status = 'active'
  order by c.name;
$$;

revoke all on function public.rpc_session_context() from public, anon;
grant execute on function public.rpc_session_context() to authenticated;

comment on function public.rpc_update_company_profile(uuid,text,text,text,text,text)
is 'Atualiza o perfil e logotipo da empresa com autorização administrativa.';

comment on function public.rpc_session_context()
is 'Vínculos, perfil das empresas e permissões efetivas do usuário em uma ida.';

commit;
