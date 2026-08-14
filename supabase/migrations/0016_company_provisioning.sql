-- 0016_company_provisioning.sql
-- Provisionamento interno de tenant, papéis padrão, permissões e unidades.
--
-- Esta função NÃO é executável por anon/authenticated.
-- Deve ser chamada somente por backend administrativo/service role/conexão segura.

begin;

create or replace function private.provision_company(
  p_owner_user_id uuid,
  p_name text,
  p_legal_name text default null,
  p_document_number text default null,
  p_timezone text default 'America/Sao_Paulo',
  p_currency_code char(3) default 'BRL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_admin_role uuid;
  v_buyer_role uuid;
  v_manager_role uuid;
  v_receiving_role uuid;
  v_viewer_role uuid;
begin
  if not exists (
    select 1 from auth.users u where u.id = p_owner_user_id
  ) then
    raise exception 'Usuário proprietário não existe no Supabase Auth';
  end if;

  insert into public.companies (
    name,
    legal_name,
    document_number,
    timezone,
    currency_code,
    status
  )
  values (
    p_name,
    p_legal_name,
    p_document_number,
    coalesce(p_timezone, 'America/Sao_Paulo'),
    coalesce(p_currency_code, 'BRL'),
    'active'
  )
  returning id into v_company_id;

  insert into public.roles (company_id, name, description, is_system)
  values (v_company_id, 'Administrador', 'Administração completa da empresa', true)
  returning id into v_admin_role;

  insert into public.roles (company_id, name, description, is_system)
  values (v_company_id, 'Comprador', 'Operação completa de compras', true)
  returning id into v_buyer_role;

  insert into public.roles (company_id, name, description, is_system)
  values (v_company_id, 'Gerente', 'Supervisão e análises', true)
  returning id into v_manager_role;

  insert into public.roles (company_id, name, description, is_system)
  values (v_company_id, 'Recebimento', 'Registro e conferência de entregas', true)
  returning id into v_receiving_role;

  insert into public.roles (company_id, name, description, is_system)
  values (v_company_id, 'Consulta', 'Acesso somente leitura', true)
  returning id into v_viewer_role;

  -- Administrador: todas as permissões existentes.
  insert into public.role_permissions (role_id, permission_id)
  select v_admin_role, p.id
  from public.permissions p
  on conflict do nothing;

  -- Comprador.
  insert into public.role_permissions (role_id, permission_id)
  select v_buyer_role, p.id
  from public.permissions p
  where p.key in (
    'product.view','product.create','product.update','product.deactivate',
    'supplier.view','supplier.create','supplier.update','supplier.deactivate','supplier.history.view',
    'purchase_round.view','purchase_round.create','purchase_round.update','purchase_round.send','purchase_round.close','purchase_round.cancel',
    'quotation_response.view','quotation_response.manual_create','quotation_response.correct',
    'negotiation.view','negotiation.create','negotiation.correct',
    'purchase_allocation.view','purchase_allocation.create','purchase_allocation.update','purchase_allocation.confirm',
    'order.view','order.create','order.update_draft','order.send','order.revise','order.cancel',
    'receipt.view','receipt.create','receipt.post',
    'commercial_divergence.view','commercial_divergence.create','commercial_divergence.manage',
    'analytics.view','analytics.financial.view','analytics.supplier.view'
  )
  on conflict do nothing;

  -- Gerente.
  insert into public.role_permissions (role_id, permission_id)
  select v_manager_role, p.id
  from public.permissions p
  where p.key in (
    'product.view',
    'supplier.view','supplier.history.view',
    'purchase_round.view','purchase_round.close',
    'quotation_response.view',
    'negotiation.view',
    'purchase_allocation.view',
    'order.view',
    'receipt.view',
    'commercial_divergence.view','commercial_divergence.manage',
    'analytics.view','analytics.financial.view','analytics.supplier.view','analytics.export'
  )
  on conflict do nothing;

  -- Recebimento.
  insert into public.role_permissions (role_id, permission_id)
  select v_receiving_role, p.id
  from public.permissions p
  where p.key in (
    'product.view',
    'supplier.view',
    'order.view',
    'receipt.view','receipt.create','receipt.post',
    'commercial_divergence.view','commercial_divergence.create'
  )
  on conflict do nothing;

  -- Consulta.
  insert into public.role_permissions (role_id, permission_id)
  select v_viewer_role, p.id
  from public.permissions p
  where p.key in (
    'product.view',
    'supplier.view',
    'purchase_round.view',
    'quotation_response.view',
    'negotiation.view',
    'purchase_allocation.view',
    'order.view',
    'receipt.view',
    'commercial_divergence.view'
  )
  on conflict do nothing;

  insert into public.company_members (
    company_id,
    user_id,
    role_id,
    status,
    joined_at
  )
  values (
    v_company_id,
    p_owner_user_id,
    v_admin_role,
    'active',
    now()
  );

  -- Unidades iniciais. Cada empresa pode editar/adicionar depois.
  insert into public.units (company_id, code, name, symbol, kind)
  values
    (v_company_id, 'kg', 'Quilograma', 'kg', 'mass'),
    (v_company_id, 'g', 'Grama', 'g', 'mass'),
    (v_company_id, 'un', 'Unidade', 'un', 'count'),
    (v_company_id, 'cx', 'Caixa', 'cx', 'package'),
    (v_company_id, 'pct', 'Pacote', 'pct', 'package'),
    (v_company_id, 'fd', 'Fardo', 'fd', 'package'),
    (v_company_id, 'pc', 'Peça', 'pc', 'count'),
    (v_company_id, 'metade', 'Metade', 'metade', 'count')
  on conflict (company_id, code) do nothing;

  perform private.emit_domain_event(
    v_company_id,
    'company.provisioned',
    'company',
    v_company_id,
    jsonb_build_object('owner_user_id', p_owner_user_id),
    'system',
    null,
    null
  );

  return v_company_id;
end;
$$;

revoke all on function private.provision_company(uuid,text,text,text,text,char)
from public, anon, authenticated;

commit;
