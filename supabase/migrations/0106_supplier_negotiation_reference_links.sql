-- Referências anonimizadas para negociação final com fornecedor.
-- O link revela somente os produtos e preços que o comprador escolheu e
-- registra a contraproposta na trilha normal de negociações.

begin;

create table public.negotiation_reference_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  round_supplier_id uuid not null,
  supplier_id uuid not null,
  token_hash text not null unique,
  status text not null default 'active'
    check (status in ('active','completed','revoked')),
  expires_at timestamptz not null,
  first_accessed_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete cascade,
  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete cascade,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict
);

create index negotiation_reference_requests_round_idx
on public.negotiation_reference_requests(company_id, purchase_round_id, created_at desc);

create index negotiation_reference_requests_token_idx
on public.negotiation_reference_requests(token_hash);

create table public.negotiation_reference_request_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  request_id uuid not null,
  quotation_response_item_id uuid not null,
  product_name_snapshot text not null,
  requested_quantity_snapshot numeric(18,6) not null,
  purchase_unit_snapshot text not null,
  pricing_unit_snapshot text not null,
  reference_kind text not null
    check (reference_kind in ('best_competitor','target')),
  reference_price numeric(18,6) not null check (reference_price > 0),
  reference_unit_snapshot text not null,
  supplier_price_snapshot numeric(18,6) not null check (supplier_price_snapshot >= 0),
  submitted_price numeric(18,6) check (submitted_price is null or submitted_price >= 0),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (request_id, quotation_response_item_id),
  foreign key (company_id, request_id)
    references public.negotiation_reference_requests(company_id, id) on delete cascade,
  foreign key (company_id, quotation_response_item_id)
    references public.quotation_response_items(company_id, id) on delete restrict
);

create index negotiation_reference_request_items_request_idx
on public.negotiation_reference_request_items(request_id, created_at);

create trigger negotiation_reference_requests_set_updated_at
before update on public.negotiation_reference_requests
for each row execute function private.set_updated_at();

alter table public.negotiation_reference_requests enable row level security;
alter table public.negotiation_reference_request_items enable row level security;

revoke all on public.negotiation_reference_requests from anon, authenticated;
revoke all on public.negotiation_reference_request_items from anon, authenticated;
grant select on public.negotiation_reference_requests to authenticated;
grant select on public.negotiation_reference_request_items to authenticated;

create policy negotiation_reference_requests_select
on public.negotiation_reference_requests for select to authenticated
using (
  (select private.is_company_member(company_id))
  and (select private.has_permission(company_id, 'negotiation.view'))
);

create policy negotiation_reference_request_items_select
on public.negotiation_reference_request_items for select to authenticated
using (
  (select private.is_company_member(company_id))
  and (select private.has_permission(company_id, 'negotiation.view'))
);

create or replace function public.rpc_create_negotiation_reference_request(
  p_company_id uuid,
  p_round_supplier_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round record;
  v_request_id uuid;
  v_entry jsonb;
  v_item record;
  v_response_item_id uuid;
  v_reference_kind text;
  v_reference_price numeric;
  v_use_comparison boolean;
begin
  perform private.require_permission(p_company_id, 'negotiation.create');

  if nullif(p_token_hash, '') is null
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception 'Validade ou token inválido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Escolha ao menos um produto';
  end if;

  select rs.purchase_round_id, rs.supplier_id, rs.removed_at, pr.status
    into v_round
  from public.round_suppliers rs
  join public.purchase_rounds pr
    on pr.company_id = rs.company_id
   and pr.id = rs.purchase_round_id
  where rs.company_id = p_company_id
    and rs.id = p_round_supplier_id;

  if v_round.purchase_round_id is null or v_round.removed_at is not null then
    raise exception 'Fornecedor inválido nesta rodada';
  end if;
  if v_round.status <> 'active' then
    raise exception 'A cotação precisa estar em andamento';
  end if;

  insert into public.negotiation_reference_requests (
    company_id, purchase_round_id, round_supplier_id, supplier_id,
    token_hash, expires_at, created_by
  ) values (
    p_company_id, v_round.purchase_round_id, p_round_supplier_id,
    v_round.supplier_id, p_token_hash, p_expires_at, auth.uid()
  ) returning id into v_request_id;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_response_item_id := nullif(v_entry ->> 'response_item_id', '')::uuid;
    v_reference_kind := v_entry ->> 'reference_kind';
    v_reference_price := nullif(v_entry ->> 'reference_price', '')::numeric;
    v_use_comparison := coalesce((v_entry ->> 'use_comparison_unit')::boolean, false);

    if v_reference_kind not in ('best_competitor','target')
       or v_reference_price is null
       or v_reference_price <= 0 then
      raise exception 'Referência inválida';
    end if;

    select
      qri.id,
      product.name as product_name,
      qi.requested_quantity,
      purchase_unit.symbol as purchase_unit,
      pricing_unit.symbol as pricing_unit,
      comparison_unit.symbol as comparison_unit,
      current_price.current_price
    into v_item
    from public.quotation_response_items qri
    join public.supplier_quotation_items supplier_item
      on supplier_item.company_id = qri.company_id
     and supplier_item.id = qri.supplier_quotation_item_id
    join public.quotation_items qi
      on qi.company_id = supplier_item.company_id
     and qi.id = supplier_item.quotation_item_id
    join public.products product
      on product.company_id = qi.company_id
     and product.id = qi.product_id
    join public.units purchase_unit
      on purchase_unit.company_id = qi.company_id
     and purchase_unit.id = qi.purchase_unit_id
    join public.units pricing_unit
      on pricing_unit.company_id = qi.company_id
     and pricing_unit.id = qi.pricing_unit_id
    left join public.units comparison_unit
      on comparison_unit.company_id = qi.company_id
     and comparison_unit.id = qi.comparison_unit_id
    join public.v_current_response_prices current_price
      on current_price.company_id = qri.company_id
     and current_price.quotation_response_item_id = qri.id
    where qri.company_id = p_company_id
      and qri.id = v_response_item_id
      and supplier_item.round_supplier_id = p_round_supplier_id
      and qri.does_not_supply = false
      and qri.is_available is distinct from false;

    if v_item.id is null or v_item.current_price is null then
      raise exception 'Produto sem proposta válida para negociar';
    end if;
    if v_use_comparison and v_item.comparison_unit is null then
      raise exception 'Unidade de comparação inválida';
    end if;

    insert into public.negotiation_reference_request_items (
      company_id, request_id, quotation_response_item_id,
      product_name_snapshot, requested_quantity_snapshot,
      purchase_unit_snapshot, pricing_unit_snapshot,
      reference_kind, reference_price, reference_unit_snapshot,
      supplier_price_snapshot
    ) values (
      p_company_id, v_request_id, v_item.id,
      v_item.product_name, v_item.requested_quantity,
      v_item.purchase_unit, v_item.pricing_unit,
      v_reference_kind, v_reference_price,
      case when v_use_comparison then v_item.comparison_unit else v_item.pricing_unit end,
      v_item.current_price
    );
  end loop;

  insert into public.domain_events (
    company_id, event_type, aggregate_type, aggregate_id,
    actor_type, actor_user_id, payload
  ) values (
    p_company_id, 'negotiation.reference_created',
    'negotiation_reference_request', v_request_id,
    'user', auth.uid(),
    jsonb_build_object(
      'round_supplier_id', p_round_supplier_id,
      'item_count', jsonb_array_length(p_items),
      'expires_at', p_expires_at
    )
  );

  return v_request_id;
end;
$$;

create or replace function public.rpc_revoke_negotiation_reference_request(
  p_company_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  perform private.require_permission(p_company_id, 'negotiation.create');

  update public.negotiation_reference_requests
  set status = 'revoked', revoked_at = now()
  where company_id = p_company_id
    and id = p_request_id
    and status = 'active';
  v_changed := found;

  if v_changed then
    insert into public.domain_events (
      company_id, event_type, aggregate_type, aggregate_id,
      actor_type, actor_user_id
    ) values (
      p_company_id, 'negotiation.reference_revoked',
      'negotiation_reference_request', p_request_id,
      'user', auth.uid()
    );
  end if;
  return v_changed;
end;
$$;

create or replace function private.resolve_negotiation_reference_token(p_token text)
returns public.negotiation_reference_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.negotiation_reference_requests;
begin
  if nullif(p_token, '') is null then
    raise exception 'Token inválido' using errcode = '42501';
  end if;

  select request.* into v_request
  from public.negotiation_reference_requests request
  join public.purchase_rounds round
    on round.company_id = request.company_id
   and round.id = request.purchase_round_id
  where request.token_hash = private.hash_public_token(p_token)
    and request.status in ('active','completed')
    and request.revoked_at is null
    and request.expires_at > now()
    and round.status = 'active'
  limit 1;

  if v_request.id is null then
    raise exception 'Acesso inválido ou expirado' using errcode = '42501';
  end if;

  update public.negotiation_reference_requests
  set first_accessed_at = coalesce(first_accessed_at, now())
  where id = v_request.id;
  return v_request;
end;
$$;

create or replace function public.rpc_public_get_negotiation_reference(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.negotiation_reference_requests;
  v_result jsonb;
begin
  v_request := private.resolve_negotiation_reference_token(p_token);

  select jsonb_build_object(
    'request_id', request.id,
    'status', request.status,
    'expires_at', request.expires_at,
    'company', jsonb_build_object(
      'name', company.name,
      'legal_name', company.legal_name,
      'logo_path', company.logo_path
    ),
    'supplier', jsonb_build_object('id', supplier.id, 'name', supplier.name),
    'purchase_round', jsonb_build_object('id', round.id, 'title', round.title),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'product_name', item.product_name_snapshot,
          'requested_quantity', item.requested_quantity_snapshot,
          'purchase_unit', item.purchase_unit_snapshot,
          'pricing_unit', item.pricing_unit_snapshot,
          'reference_kind', item.reference_kind,
          'reference_price', item.reference_price,
          'reference_unit', item.reference_unit_snapshot,
          'supplier_price', item.supplier_price_snapshot,
          'submitted_price', item.submitted_price,
          'submitted_at', item.submitted_at
        ) order by item.created_at, item.id
      )
      from public.negotiation_reference_request_items item
      where item.company_id = request.company_id
        and item.request_id = request.id
    ), '[]'::jsonb)
  ) into v_result
  from public.negotiation_reference_requests request
  join public.companies company on company.id = request.company_id
  join public.suppliers supplier
    on supplier.company_id = request.company_id and supplier.id = request.supplier_id
  join public.purchase_rounds round
    on round.company_id = request.company_id and round.id = request.purchase_round_id
  where request.id = v_request.id;

  return v_result;
end;
$$;

create or replace function public.rpc_public_submit_negotiation_reference(
  p_token text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.negotiation_reference_requests;
  v_entry jsonb;
  v_item record;
  v_item_id uuid;
  v_new_price numeric;
  v_previous_price numeric;
  v_submitted integer := 0;
begin
  v_request := private.resolve_negotiation_reference_token(p_token);
  if v_request.status = 'completed' then
    raise exception 'Esta contraproposta já foi enviada';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um preço';
  end if;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_entry ->> 'id', '')::uuid;
    v_new_price := round(nullif(v_entry ->> 'new_price', '')::numeric, 2);
    if v_new_price is null or v_new_price <= 0 then
      raise exception 'Preço inválido';
    end if;

    select item.*, response.quoted_price
      into v_item
    from public.negotiation_reference_request_items item
    join public.quotation_response_items response
      on response.company_id = item.company_id
     and response.id = item.quotation_response_item_id
    where item.company_id = v_request.company_id
      and item.request_id = v_request.id
      and item.id = v_item_id
      and item.submitted_at is null
    for update of item;

    if v_item.id is null then
      raise exception 'Produto inválido ou já respondido';
    end if;

    select coalesce(
      (
        select negotiation.new_price
        from public.negotiations negotiation
        where negotiation.company_id = v_request.company_id
          and negotiation.quotation_response_item_id = v_item.quotation_response_item_id
        order by negotiation.created_at desc, negotiation.id desc
        limit 1
      ),
      v_item.quoted_price
    ) into v_previous_price;

    if v_previous_price is null then
      raise exception 'Proposta original não encontrada';
    end if;

    insert into public.negotiations (
      company_id, quotation_response_item_id, previous_price, new_price,
      channel, notes, negotiated_by
    ) values (
      v_request.company_id, v_item.quotation_response_item_id,
      v_previous_price, v_new_price, 'other',
      'Contraproposta enviada pelo link de referência ' || v_request.id,
      null
    );

    update public.negotiation_reference_request_items
    set submitted_price = v_new_price, submitted_at = now()
    where company_id = v_request.company_id and id = v_item.id;
    v_submitted := v_submitted + 1;
  end loop;

  if exists (
    select 1 from public.negotiation_reference_request_items item
    where item.company_id = v_request.company_id
      and item.request_id = v_request.id
      and item.submitted_at is null
  ) then
    update public.negotiation_reference_requests set status = 'active'
    where company_id = v_request.company_id and id = v_request.id;
  else
    update public.negotiation_reference_requests
    set status = 'completed', completed_at = now()
    where company_id = v_request.company_id and id = v_request.id;
  end if;

  insert into public.domain_events (
    company_id, event_type, aggregate_type, aggregate_id,
    actor_type, actor_supplier_id, payload
  ) values (
    v_request.company_id, 'negotiation.reference_responded',
    'negotiation_reference_request', v_request.id,
    'supplier', v_request.supplier_id,
    jsonb_build_object('submitted_items', v_submitted)
  );

  return jsonb_build_object('submitted_items', v_submitted);
end;
$$;

create or replace function private.notify_negotiation_reference_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_name text;
  v_round_id uuid;
begin
  select supplier.name, request.purchase_round_id
    into v_supplier_name, v_round_id
  from public.negotiation_reference_requests request
  join public.suppliers supplier
    on supplier.company_id = request.company_id
   and supplier.id = request.supplier_id
  where request.company_id = new.company_id
    and request.id = new.aggregate_id;

  insert into public.notifications (
    company_id, user_id, type, title, message, priority,
    resource_type, resource_id, action_url, metadata
  )
  select
    new.company_id,
    member.user_id,
    new.event_type,
    coalesce(v_supplier_name, 'O fornecedor') || ' enviou uma contraproposta',
    coalesce(new.payload ->> 'submitted_items', '1') ||
      ' produto(s) foram atualizados para comparação.',
    'normal',
    new.aggregate_type,
    new.aggregate_id,
    '/compras/' || v_round_id::text || '/comparacao',
    new.payload
  from private.members_with_permission(new.company_id, 'negotiation.view') member;

  return new;
end;
$$;

create trigger domain_events_notify_negotiation_reference
after insert on public.domain_events
for each row
when (new.event_type = 'negotiation.reference_responded')
execute function private.notify_negotiation_reference_response();

revoke all on function public.rpc_create_negotiation_reference_request(
  uuid, uuid, text, timestamptz, jsonb
) from public, anon;
grant execute on function public.rpc_create_negotiation_reference_request(
  uuid, uuid, text, timestamptz, jsonb
) to authenticated;

revoke all on function public.rpc_revoke_negotiation_reference_request(uuid, uuid)
from public, anon;
grant execute on function public.rpc_revoke_negotiation_reference_request(uuid, uuid)
to authenticated;

revoke all on function private.resolve_negotiation_reference_token(text)
from public, anon, authenticated;
revoke all on function private.notify_negotiation_reference_response()
from public, anon, authenticated;
revoke all on function public.rpc_public_get_negotiation_reference(text)
from public;
grant execute on function public.rpc_public_get_negotiation_reference(text)
to anon, authenticated;
revoke all on function public.rpc_public_submit_negotiation_reference(text, jsonb)
from public;
grant execute on function public.rpc_public_submit_negotiation_reference(text, jsonb)
to anon, authenticated;

commit;
