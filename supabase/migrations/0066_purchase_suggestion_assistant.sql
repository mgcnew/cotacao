-- 0066_purchase_suggestion_assistant.sql
-- Sugestoes conservadoras de reposicao baseadas em recebimentos efetivamente
-- conferidos. A sugestao nunca cria pedido: o usuario decide se leva o item
-- para a lista de compras.

begin;

create table public.purchase_suggestion_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  action text not null check (action in ('accepted', 'dismissed')),
  suggested_quantity numeric(18,6) check (suggested_quantity is null or suggested_quantity > 0),
  chosen_quantity numeric(18,6) check (chosen_quantity is null or chosen_quantity > 0),
  valid_until date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade
);

create index purchase_suggestion_events_lookup_idx
on public.purchase_suggestion_events(company_id, product_id, valid_until desc, created_at desc);

create unique index purchase_suggestion_events_cycle_action_uidx
on public.purchase_suggestion_events(company_id, product_id, action, valid_until);

alter table public.purchase_suggestion_events enable row level security;
revoke all on public.purchase_suggestion_events from anon;
grant select on public.purchase_suggestion_events to authenticated;

create policy purchase_suggestion_events_select
on public.purchase_suggestion_events for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create or replace function public.rpc_get_purchase_suggestions(
  p_company_id uuid,
  p_history_weeks integer default 8,
  p_limit integer default 12
)
returns table (
  product_id uuid,
  product_name text,
  purchase_unit text,
  expected_weekly_quantity numeric,
  current_week_received_quantity numeric,
  open_order_quantity numeric,
  open_quotation_quantity numeric,
  shopping_list_quantity numeric,
  suggested_quantity numeric,
  active_weeks integer,
  observed_weeks integer,
  variation_percent numeric,
  confidence text,
  last_received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_current_week date;
  v_today date;
  v_history_weeks integer := greatest(3, least(coalesce(p_history_weeks, 8), 16));
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform private.require_permission(p_company_id, 'product.view');
  end if;

  select coalesce(nullif(c.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies c
  where c.id = p_company_id;

  if v_timezone is null then
    raise exception 'Empresa nao encontrada';
  end if;

  v_today := (now() at time zone v_timezone)::date;
  v_current_week := date_trunc('week', now() at time zone v_timezone)::date;

  return query
  with history_weekly as (
    select
      ori.product_id,
      date_trunc('week', r.received_at at time zone v_timezone)::date as week_start,
      sum(ri.logistic_quantity_received)::numeric as received_quantity,
      max(r.received_at) as last_received_at
    from public.receipt_items ri
    join public.receipts r
      on r.company_id = ri.company_id
     and r.id = ri.receipt_id
     and r.status = 'posted'
    join public.order_revision_items ori
      on ori.company_id = ri.company_id
     and ori.id = ri.order_revision_item_id
    join public.products p
      on p.company_id = ori.company_id
     and p.id = ori.product_id
     and p.is_active
     and p.purchase_unit_id = ori.purchase_unit_id
    where ri.company_id = p_company_id
      and r.received_at >= (v_current_week - (v_history_weeks * interval '1 week'))::timestamp at time zone v_timezone
      and r.received_at < v_current_week::timestamp at time zone v_timezone
    group by ori.product_id, date_trunc('week', r.received_at at time zone v_timezone)::date
  ),
  history_stats as (
    select
      hw.product_id,
      percentile_cont(0.5) within group (order by hw.received_quantity)::numeric as expected_quantity,
      count(*)::integer as active_weeks,
      greatest(1, ((v_current_week - min(hw.week_start)) / 7))::integer as observed_weeks,
      case
        when avg(hw.received_quantity) > 0
          then (coalesce(stddev_pop(hw.received_quantity), 0) / avg(hw.received_quantity) * 100)::numeric
        else 0::numeric
      end as variation_percent,
      max(hw.last_received_at) as last_received_at
    from history_weekly hw
    group by hw.product_id
  ),
  current_received as (
    select ori.product_id, sum(ri.logistic_quantity_received)::numeric as quantity
    from public.receipt_items ri
    join public.receipts r
      on r.company_id = ri.company_id
     and r.id = ri.receipt_id
     and r.status = 'posted'
    join public.order_revision_items ori
      on ori.company_id = ri.company_id
     and ori.id = ri.order_revision_item_id
    join public.products p
      on p.company_id = ori.company_id
     and p.id = ori.product_id
     and p.purchase_unit_id = ori.purchase_unit_id
    where ri.company_id = p_company_id
      and r.received_at >= v_current_week::timestamp at time zone v_timezone
    group by ori.product_id
  ),
  received_by_revision_item as (
    select ri.order_revision_item_id, sum(ri.logistic_quantity_received)::numeric as quantity
    from public.receipt_items ri
    join public.receipts r
      on r.company_id = ri.company_id
     and r.id = ri.receipt_id
     and r.status = 'posted'
    where ri.company_id = p_company_id
    group by ri.order_revision_item_id
  ),
  open_orders as (
    select
      ori.product_id,
      sum(greatest(ori.requested_quantity - coalesce(rri.quantity, 0), 0))::numeric as quantity
    from public.orders o
    join public.order_revision_items ori
      on ori.company_id = o.company_id
     and ori.order_revision_id = o.current_revision_id
    join public.products p
      on p.company_id = ori.company_id
     and p.id = ori.product_id
     and p.purchase_unit_id = ori.purchase_unit_id
    left join received_by_revision_item rri on rri.order_revision_item_id = ori.id
    where o.company_id = p_company_id
      and o.status in ('draft', 'awaiting_confirmation', 'awaiting_delivery', 'partially_received')
    group by ori.product_id
  ),
  open_quotations as (
    select qi.product_id, sum(qi.requested_quantity)::numeric as quantity
    from public.quotation_items qi
    join public.purchase_rounds pr
      on pr.company_id = qi.company_id
     and pr.id = qi.purchase_round_id
     and pr.status in ('draft', 'active')
    join public.products p
      on p.company_id = qi.company_id
     and p.id = qi.product_id
     and p.purchase_unit_id = qi.purchase_unit_id
    where qi.company_id = p_company_id
      and qi.commercial_status = 'open'
    group by qi.product_id
  ),
  pending_list as (
    select sli.product_id, sum(sli.requested_quantity)::numeric as quantity
    from public.shopping_list_items sli
    join public.shopping_lists sl
      on sl.company_id = sli.company_id
     and sl.id = sli.shopping_list_id
     and sl.status = 'open'
    join public.products p
      on p.company_id = sli.company_id
     and p.id = sli.product_id
     and p.purchase_unit_id = sli.purchase_unit_id
    where sli.company_id = p_company_id
      and sli.status = 'pending'
    group by sli.product_id
  ),
  candidates as (
    select
      p.id as product_id,
      p.name as product_name,
      u.symbol as purchase_unit,
      hs.expected_quantity,
      coalesce(cr.quantity, 0)::numeric as current_received,
      coalesce(oo.quantity, 0)::numeric as order_quantity,
      coalesce(oq.quantity, 0)::numeric as quotation_quantity,
      coalesce(pl.quantity, 0)::numeric as list_quantity,
      hs.active_weeks,
      hs.observed_weeks,
      hs.variation_percent,
      hs.last_received_at
    from history_stats hs
    join public.products p
      on p.company_id = p_company_id
     and p.id = hs.product_id
     and p.is_active
    join public.units u
      on u.company_id = p.company_id
     and u.id = p.purchase_unit_id
    left join current_received cr on cr.product_id = p.id
    left join open_orders oo on oo.product_id = p.id
    left join open_quotations oq on oq.product_id = p.id
    left join pending_list pl on pl.product_id = p.id
    where hs.active_weeks >= 3
      and hs.active_weeks::numeric / greatest(hs.observed_weeks, 1) >= 0.65
      and not exists (
        select 1
        from public.purchase_suggestion_events pse
        where pse.company_id = p_company_id
          and pse.product_id = p.id
          and pse.valid_until >= v_today
      )
  )
  select
    c.product_id,
    c.product_name,
    c.purchase_unit,
    round(c.expected_quantity, 3),
    round(c.current_received, 3),
    round(c.order_quantity, 3),
    round(c.quotation_quantity, 3),
    round(c.list_quantity, 3),
    round(greatest(
      c.expected_quantity - c.current_received - c.order_quantity
        - c.quotation_quantity - c.list_quantity,
      0
    ), 3) as suggested_quantity,
    c.active_weeks,
    c.observed_weeks,
    round(c.variation_percent, 1),
    case
      when c.active_weeks >= 6 and c.variation_percent <= 25 then 'high'
      else 'medium'
    end,
    c.last_received_at
  from candidates c
  where greatest(
    c.expected_quantity - c.current_received - c.order_quantity
      - c.quotation_quantity - c.list_quantity,
    0
  ) > 0
  order by
    case when c.active_weeks >= 6 and c.variation_percent <= 25 then 0 else 1 end,
    c.active_weeks desc,
    c.product_name
  limit v_limit;
end;
$$;

create or replace function public.rpc_accept_purchase_suggestion(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_suggested_quantity numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_list_id uuid;
  v_item_id uuid;
  v_event_id uuid;
  v_purchase_unit_id uuid;
  v_valid_until date;
begin
  if not (
    coalesce(private.has_permission(p_company_id, 'product.update'), false)
    or coalesce(private.has_permission(p_company_id, 'purchase_round.create'), false)
    or coalesce(private.has_permission(p_company_id, 'order.create'), false)
  ) then
    raise exception 'Sem permissao para alterar a lista de compras';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select p.purchase_unit_id
  into v_purchase_unit_id
  from public.products p
  where p.company_id = p_company_id
    and p.id = p_product_id
    and p.is_active;

  if v_purchase_unit_id is null then
    raise exception 'Produto nao encontrado ou desativado';
  end if;

  select coalesce(nullif(c.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies c
  where c.id = p_company_id;

  v_valid_until := date_trunc('week', now() at time zone v_timezone)::date + 6;

  insert into public.purchase_suggestion_events (
    company_id, product_id, action, suggested_quantity,
    chosen_quantity, valid_until, created_by
  ) values (
    p_company_id, p_product_id, 'accepted', p_suggested_quantity,
    p_quantity, v_valid_until, auth.uid()
  )
  on conflict (company_id, product_id, action, valid_until) do nothing
  returning id into v_event_id;

  -- Torna a ação idempotente: dois cliques ou duas abas não somam a mesma
  -- recomendação duas vezes.
  if v_event_id is null then
    select sli.id into v_item_id
    from public.shopping_list_items sli
    join public.shopping_lists sl
      on sl.company_id = sli.company_id and sl.id = sli.shopping_list_id
    where sli.company_id = p_company_id
      and sli.product_id = p_product_id
      and sli.status = 'pending'
      and sl.status = 'open'
    limit 1;
    return v_item_id;
  end if;

  select sl.id into v_list_id
  from public.shopping_lists sl
  where sl.company_id = p_company_id and sl.status = 'open'
  for update;

  if v_list_id is null then
    begin
      insert into public.shopping_lists (company_id, name, created_by)
      values (p_company_id, 'Lista atual', auth.uid())
      returning id into v_list_id;
    exception when unique_violation then
      select sl.id into v_list_id
      from public.shopping_lists sl
      where sl.company_id = p_company_id and sl.status = 'open';
    end;
  end if;

  insert into public.shopping_list_items (
    company_id, shopping_list_id, product_id, requested_quantity,
    purchase_unit_id, notes, added_by
  ) values (
    p_company_id, v_list_id, p_product_id, p_quantity,
    v_purchase_unit_id, 'Sugestao baseada no historico de recebimentos', auth.uid()
  )
  on conflict (shopping_list_id, product_id) where status = 'pending'
  do update set
    requested_quantity = public.shopping_list_items.requested_quantity + excluded.requested_quantity,
    updated_at = now()
  returning id into v_item_id;

  return v_item_id;
end;
$$;

create or replace function public.rpc_dismiss_purchase_suggestion(
  p_company_id uuid,
  p_product_id uuid,
  p_suggested_quantity numeric default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_valid_until date;
begin
  if not (
    coalesce(private.has_permission(p_company_id, 'product.update'), false)
    or coalesce(private.has_permission(p_company_id, 'purchase_round.create'), false)
    or coalesce(private.has_permission(p_company_id, 'order.create'), false)
  ) then
    raise exception 'Sem permissao para revisar sugestoes de compra';
  end if;

  if not exists (
    select 1 from public.products p
    where p.company_id = p_company_id and p.id = p_product_id and p.is_active
  ) then
    raise exception 'Produto nao encontrado ou desativado';
  end if;

  select coalesce(nullif(c.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies c
  where c.id = p_company_id;

  v_valid_until := date_trunc('week', now() at time zone v_timezone)::date + 6;

  insert into public.purchase_suggestion_events (
    company_id, product_id, action, suggested_quantity, valid_until, created_by
  ) values (
    p_company_id, p_product_id, 'dismissed', p_suggested_quantity,
    v_valid_until, auth.uid()
  )
  on conflict (company_id, product_id, action, valid_until) do nothing;

  return v_valid_until;
end;
$$;

revoke all on function public.rpc_get_purchase_suggestions(uuid,integer,integer)
  from public, anon;
grant execute on function public.rpc_get_purchase_suggestions(uuid,integer,integer)
  to authenticated;

revoke all on function public.rpc_accept_purchase_suggestion(uuid,uuid,numeric,numeric)
  from public, anon;
grant execute on function public.rpc_accept_purchase_suggestion(uuid,uuid,numeric,numeric)
  to authenticated;

revoke all on function public.rpc_dismiss_purchase_suggestion(uuid,uuid,numeric)
  from public, anon;
grant execute on function public.rpc_dismiss_purchase_suggestion(uuid,uuid,numeric)
  to authenticated;

commit;
