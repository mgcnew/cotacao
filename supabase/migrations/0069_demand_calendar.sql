-- 0069_demand_calendar.sql
-- Contextos conhecidos que alteram a necessidade normal: feriados, datas de
-- pagamento, promocoes e eventos locais. O impacto e sempre explicito e
-- revisavel; nenhum evento cria compra por conta propria.

begin;

create table public.demand_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  event_type text not null check (
    event_type in ('holiday', 'payday', 'promotion', 'seasonal', 'other')
  ),
  start_date date not null,
  end_date date not null,
  adjustment_percent numeric(6,2) not null
    check (adjustment_percent between -80 and 200),
  scope text not null default 'all'
    check (scope in ('all', 'category', 'product')),
  category_id uuid,
  product_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete restrict,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,
  check (start_date <= end_date),
  check (
    (scope = 'all' and category_id is null and product_id is null)
    or (scope = 'category' and category_id is not null and product_id is null)
    or (scope = 'product' and category_id is null and product_id is not null)
  )
);

create index demand_calendar_events_period_idx
on public.demand_calendar_events(company_id, start_date, end_date)
where is_active;

create index demand_calendar_events_category_idx
on public.demand_calendar_events(company_id, category_id)
where is_active and category_id is not null;

create index demand_calendar_events_product_idx
on public.demand_calendar_events(company_id, product_id)
where is_active and product_id is not null;

create trigger demand_calendar_events_set_updated_at
before update on public.demand_calendar_events
for each row execute function private.set_updated_at();

alter table public.demand_calendar_events enable row level security;
revoke all on public.demand_calendar_events from anon;
grant select, insert, update, delete on public.demand_calendar_events to authenticated;

create policy demand_calendar_events_select
on public.demand_calendar_events for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy demand_calendar_events_insert
on public.demand_calendar_events for insert to authenticated
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

create policy demand_calendar_events_update
on public.demand_calendar_events for update to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

create policy demand_calendar_events_delete
on public.demand_calendar_events for delete to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

-- Diferente da primeira RPC de sugestoes, esta devolve tambem produtos cuja
-- necessidade normal ja esta coberta. Isso e essencial: um feriado de +20%
-- pode criar uma necessidade adicional mesmo quando a media semanal ja foi
-- totalmente comprada.
create or replace function public.rpc_get_purchase_demand_baselines(
  p_company_id uuid,
  p_history_weeks integer default 8,
  p_limit integer default 100
)
returns table (
  product_id uuid,
  product_name text,
  category_id uuid,
  purchase_unit text,
  historical_weekly_quantity numeric,
  current_week_received_quantity numeric,
  open_order_quantity numeric,
  open_quotation_quantity numeric,
  shopping_list_quantity numeric,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
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
  )
  select
    p.id,
    p.name,
    p.category_id,
    u.symbol,
    round(hs.expected_quantity, 3),
    round(coalesce(cr.quantity, 0), 3),
    round(coalesce(oo.quantity, 0), 3),
    round(coalesce(oq.quantity, 0), 3),
    round(coalesce(pl.quantity, 0), 3),
    hs.active_weeks,
    hs.observed_weeks,
    round(hs.variation_percent, 1),
    case
      when hs.active_weeks >= 6 and hs.variation_percent <= 25 then 'high'
      else 'medium'
    end,
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
  order by
    case when hs.active_weeks >= 6 and hs.variation_percent <= 25 then 0 else 1 end,
    hs.active_weeks desc,
    p.name
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_purchase_demand_baselines(uuid,integer,integer)
  from public, anon;
grant execute on function public.rpc_get_purchase_demand_baselines(uuid,integer,integer)
  to authenticated, service_role;

commit;
