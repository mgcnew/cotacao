-- 0093_public_receiving_display.sql
--
-- Painel publico, somente leitura, para o aparelho usado na conferencia fisica.
-- O token bruto nunca e persistido: somente seu SHA-256 fica no banco. Cada
-- empresa possui no maximo um link ativo, que pode ser revogado ou substituido
-- por um administrador.

begin;

create table public.receiving_display_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  unique (company_id, id)
);

create unique index receiving_display_links_one_active_company_idx
on public.receiving_display_links(company_id)
where revoked_at is null;

create index receiving_display_links_company_created_idx
on public.receiving_display_links(company_id, created_at desc);

alter table public.receiving_display_links enable row level security;

revoke all on public.receiving_display_links from public, anon, authenticated;
grant select on public.receiving_display_links to authenticated;

create policy receiving_display_links_select_admin
on public.receiving_display_links
for select to authenticated
using (
  (select private.has_permission(company_id, 'role.manage'))
);

-- Rotaciona o link em uma unica transacao. A funcao e exclusiva do backend
-- com service role, mas ainda valida empresa, usuario e formato do hash.
create or replace function public.rpc_service_rotate_receiving_display_link(
  p_company_id uuid,
  p_created_by uuid,
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Token invalido';
  end if;

  if not exists (
    select 1
    from public.company_members member
    where member.company_id = p_company_id
      and member.user_id = p_created_by
      and member.status = 'active'
  ) then
    raise exception 'Usuario nao pertence a empresa';
  end if;

  update public.receiving_display_links
  set revoked_at = now()
  where company_id = p_company_id
    and revoked_at is null;

  insert into public.receiving_display_links (
    company_id,
    token_hash,
    created_by
  )
  values (
    p_company_id,
    lower(p_token_hash),
    p_created_by
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_service_rotate_receiving_display_link(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.rpc_service_rotate_receiving_display_link(uuid,uuid,text)
to service_role;

create or replace function public.rpc_revoke_receiving_display_link(
  p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_permission(p_company_id, 'role.manage');

  update public.receiving_display_links
  set revoked_at = now()
  where company_id = p_company_id
    and revoked_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.rpc_revoke_receiving_display_link(uuid)
from public, anon;
grant execute on function public.rpc_revoke_receiving_display_link(uuid)
to authenticated;

-- Retorna apenas a projecao necessaria para a conferencia. Nao existe SELECT
-- anonimo nas tabelas internas; todo acesso passa pelo token revogavel.
create or replace function public.rpc_public_get_receiving_display(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.receiving_display_links;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise sqlstate '42501' using message = 'Link invalido ou revogado';
  end if;

  select link.*
  into v_link
  from public.receiving_display_links link
  where link.token_hash = private.hash_public_token(p_token)
    and link.revoked_at is null
  limit 1;

  if v_link.id is null then
    raise sqlstate '42501' using message = 'Link invalido ou revogado';
  end if;

  update public.receiving_display_links
  set last_accessed_at = now()
  where id = v_link.id;

  with received_by_item as (
    select
      item.order_revision_item_id,
      sum(item.logistic_quantity_received) as received_quantity
    from public.receipt_items item
    join public.receipts receipt
      on receipt.id = item.receipt_id
     and receipt.company_id = item.company_id
     and receipt.status = 'posted'
    where item.company_id = v_link.company_id
    group by item.order_revision_item_id
  ),
  pending_items as (
    select
      orders.id as order_id,
      orders.order_number,
      orders.status as order_status,
      supplier.id as supplier_id,
      supplier.name as supplier_name,
      revision.delivery_due_date,
      revision_item.id as item_id,
      revision_item.product_name_snapshot as product_name,
      revision_item.requested_quantity,
      coalesce(received.received_quantity, 0) as received_quantity,
      greatest(
        revision_item.requested_quantity - coalesce(received.received_quantity, 0),
        0
      ) as pending_quantity,
      revision_item.agreed_price,
      purchase_unit.symbol as purchase_unit,
      pricing_unit.symbol as pricing_unit
    from public.orders orders
    join public.suppliers supplier
      on supplier.id = orders.supplier_id
     and supplier.company_id = orders.company_id
    join public.order_revisions revision
      on revision.id = orders.current_revision_id
     and revision.company_id = orders.company_id
    join public.order_revision_items revision_item
      on revision_item.order_revision_id = revision.id
     and revision_item.company_id = revision.company_id
    join public.units purchase_unit
      on purchase_unit.id = revision_item.purchase_unit_id
     and purchase_unit.company_id = revision_item.company_id
    join public.units pricing_unit
      on pricing_unit.id = revision_item.pricing_unit_id
     and pricing_unit.company_id = revision_item.company_id
    left join received_by_item received
      on received.order_revision_item_id = revision_item.id
    where orders.company_id = v_link.company_id
      and orders.status in ('awaiting_delivery', 'partially_received')
      and revision_item.requested_quantity > coalesce(received.received_quantity, 0)
  ),
  order_payloads as (
    select
      item.order_id,
      item.order_number,
      item.order_status,
      item.supplier_id,
      item.supplier_name,
      item.delivery_due_date,
      jsonb_build_object(
        'order_number', item.order_number,
        'status', item.order_status,
        'supplier_id', item.supplier_id,
        'supplier_name', item.supplier_name,
        'delivery_due_date', item.delivery_due_date,
        'items', jsonb_agg(
          jsonb_build_object(
            'item_id', item.item_id,
            'product_name', item.product_name,
            'requested_quantity', item.requested_quantity,
            'received_quantity', item.received_quantity,
            'pending_quantity', item.pending_quantity,
            'purchase_unit', item.purchase_unit,
            'agreed_price', item.agreed_price,
            'pricing_unit', item.pricing_unit
          )
          order by item.product_name
        )
      ) as payload
    from pending_items item
    group by
      item.order_id,
      item.order_number,
      item.order_status,
      item.supplier_id,
      item.supplier_name,
      item.delivery_due_date
  )
  select jsonb_build_object(
    'company', jsonb_build_object(
      'name', company.name,
      'timezone', company.timezone
    ),
    'generated_at', now(),
    'orders', coalesce(
      jsonb_agg(
        order_payload.payload
        order by
          order_payload.delivery_due_date asc nulls last,
          order_payload.supplier_name,
          order_payload.order_number
      ) filter (where order_payload.order_id is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.companies company
  left join order_payloads order_payload on true
  where company.id = v_link.company_id
  group by company.id, company.name, company.timezone;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_receiving_display(text) from public;
grant execute on function public.rpc_public_get_receiving_display(text)
to anon, authenticated;

commit;
