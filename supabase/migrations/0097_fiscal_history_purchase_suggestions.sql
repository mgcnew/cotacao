-- Usa recebimentos e NF-e historicas como uma linha do tempo unica para
-- aprender recorrencia de compra. A quantidade fiscal so e aproveitada quando
-- pode ser expressa com seguranca na unidade de compra do produto.

begin;

create or replace view public.v_purchase_demand_events
with (security_invoker = true)
as
select
  receipt_item.company_id,
  revision_item.product_id,
  purchase_order.supplier_id,
  receipt.received_at as occurred_at,
  receipt_item.logistic_quantity_received as purchase_quantity,
  true as quantity_reliable,
  'receipt'::text as source,
  receipt.id as source_document_id
from public.receipt_items receipt_item
join public.receipts receipt
  on receipt.company_id = receipt_item.company_id
 and receipt.id = receipt_item.receipt_id
 and receipt.status = 'posted'
join public.orders purchase_order
  on purchase_order.company_id = receipt.company_id
 and purchase_order.id = receipt.order_id
join public.order_revision_items revision_item
  on revision_item.company_id = receipt_item.company_id
 and revision_item.id = receipt_item.order_revision_item_id
where receipt_item.logistic_quantity_received > 0

union all

select
  item.company_id,
  item.product_id,
  history.supplier_id,
  history.issued_at,
  case
    when product.purchase_unit_id = product.pricing_unit_id
      then item.pricing_quantity
    when pg_catalog.upper(pg_catalog.btrim(coalesce(item.commercial_unit, '')))
      in (
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.code)),
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.symbol))
      ) and item.commercial_quantity > 0
      then item.commercial_quantity
    when pg_catalog.upper(pg_catalog.btrim(coalesce(item.tributary_unit, '')))
      in (
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.code)),
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.symbol))
      ) and item.tributary_quantity > 0
      then item.tributary_quantity
    else null
  end as purchase_quantity,
  case
    when product.purchase_unit_id = product.pricing_unit_id then true
    when pg_catalog.upper(pg_catalog.btrim(coalesce(item.commercial_unit, '')))
      in (
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.code)),
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.symbol))
      ) and item.commercial_quantity > 0 then true
    when pg_catalog.upper(pg_catalog.btrim(coalesce(item.tributary_unit, '')))
      in (
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.code)),
        pg_catalog.upper(pg_catalog.btrim(purchase_unit.symbol))
      ) and item.tributary_quantity > 0 then true
    else false
  end as quantity_reliable,
  'historical_nfe'::text,
  history.id
from public.historical_nfe_items item
join public.historical_nfe_imports history
  on history.company_id = item.company_id
 and history.id = item.import_id
 and history.status = 'posted'
join public.products product
  on product.company_id = item.company_id
 and product.id = item.product_id
 and product.is_active
join public.units purchase_unit
  on purchase_unit.company_id = product.company_id
 and purchase_unit.id = product.purchase_unit_id
where item.reconciliation_status = 'matched'
  -- As migrations de historico ja impedem a mesma chave em recebimento e
  -- historico. A protecao abaixo tambem cobre bases legadas inconsistentes.
  and not exists (
    select 1
    from public.receipt_documents document
    where document.company_id = history.company_id
      and document.access_key = history.access_key
  );

grant select on public.v_purchase_demand_events to authenticated;

-- A assinatura e preservada para nao quebrar os consumidores existentes. O
-- parametro agora aceita ate 104 semanas; a aplicacao usa 52 por padrao.
drop function public.rpc_get_purchase_demand_baselines(uuid, integer, integer);

create function public.rpc_get_purchase_demand_baselines(
  p_company_id uuid,
  p_history_weeks integer default 52,
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
  last_received_at timestamptz,
  cadence_weeks integer,
  cadence_confidence_percent numeric,
  history_event_count integer,
  historical_nfe_count integer,
  receipt_count integer,
  quantity_event_count integer,
  quantity_reliable boolean,
  current_cycle_has_purchase boolean,
  next_expected_date date,
  preferred_supplier_id uuid,
  preferred_supplier_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_current_week date;
  v_today date;
  v_history_weeks integer := greatest(
    16, least(coalesce(p_history_weeks, 52), 104)
  );
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform private.require_permission(p_company_id, 'product.view');
  end if;

  select coalesce(nullif(company.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies company
  where company.id = p_company_id;

  if v_timezone is null then
    raise exception 'Empresa nao encontrada';
  end if;

  v_today := (now() at time zone v_timezone)::date;
  v_current_week := date_trunc('week', now() at time zone v_timezone)::date;

  return query
  with historical_events as (
    select
      event.product_id,
      event.supplier_id,
      event.occurred_at,
      date_trunc(
        'week', event.occurred_at at time zone v_timezone
      )::date as week_start,
      case when event.quantity_reliable
        then event.purchase_quantity else null end as purchase_quantity,
      event.source,
      event.source_document_id
    from public.v_purchase_demand_events event
    where event.company_id = p_company_id
      and event.occurred_at >= (
        v_current_week - (v_history_weeks * interval '1 week')
      )::timestamp at time zone v_timezone
      and event.occurred_at <
        v_current_week::timestamp at time zone v_timezone
  ),
  history_cycles as (
    select
      event.product_id,
      event.week_start,
      case
        when bool_and(event.purchase_quantity is not null)
          then sum(event.purchase_quantity)::numeric
        else null
      end as purchase_quantity,
      max(event.occurred_at) as last_occurred_at
    from historical_events event
    group by event.product_id, event.week_start
  ),
  cycles_with_gap as (
    select
      cycle.*,
      (
        cycle.week_start - lag(cycle.week_start) over (
          partition by cycle.product_id order by cycle.week_start
        )
      ) / 7 as gap_weeks
    from history_cycles cycle
  ),
  cadence_base as (
    select
      cycle.product_id,
      count(*)::integer as active_weeks,
      greatest(
        1,
        ((v_current_week - min(cycle.week_start)) / 7)
      )::integer as observed_weeks,
      percentile_cont(0.5) within group (
        order by cycle.gap_weeks
      ) filter (where cycle.gap_weeks is not null) as median_gap_weeks,
      (
        percentile_cont(0.5) within group (
          order by cycle.purchase_quantity
        ) filter (where cycle.purchase_quantity is not null)
      )::numeric as expected_quantity,
      count(*) filter (
        where cycle.purchase_quantity is not null
      )::integer as quantity_event_count,
      case
        when avg(cycle.purchase_quantity) filter (
          where cycle.purchase_quantity is not null
        ) > 0 then (
          coalesce(stddev_pop(cycle.purchase_quantity) filter (
            where cycle.purchase_quantity is not null
          ), 0)
          / avg(cycle.purchase_quantity) filter (
            where cycle.purchase_quantity is not null
          ) * 100
        )::numeric
        else 0::numeric
      end as variation_percent,
      max(cycle.week_start) as last_week,
      max(cycle.last_occurred_at) as last_occurred_at
    from cycles_with_gap cycle
    group by cycle.product_id
  ),
  cadence_labeled as (
    select
      base.*,
      case
        when base.median_gap_weeks between 0.5 and 1.5 then 1
        when base.median_gap_weeks > 1.5 and base.median_gap_weeks <= 2.5 then 2
        when base.median_gap_weeks > 2.5 and base.median_gap_weeks <= 5 then 4
        else null
      end as cadence_weeks
    from cadence_base base
  ),
  cadence_stats as (
    select
      labeled.*,
      coalesce(
        count(*) filter (
          where gap.gap_weeks is not null
            and abs(gap.gap_weeks - labeled.cadence_weeks)
              <= case when labeled.cadence_weeks = 4 then 1 else 0 end
        )::numeric
        / nullif(count(*) filter (where gap.gap_weeks is not null), 0)
        * 100,
        0
      )::numeric as cadence_confidence_percent
    from cadence_labeled labeled
    join cycles_with_gap gap on gap.product_id = labeled.product_id
    where labeled.cadence_weeks is not null
    group by
      labeled.product_id,
      labeled.active_weeks,
      labeled.observed_weeks,
      labeled.median_gap_weeks,
      labeled.expected_quantity,
      labeled.quantity_event_count,
      labeled.variation_percent,
      labeled.last_week,
      labeled.last_occurred_at,
      labeled.cadence_weeks
  ),
  history_sources as (
    select
      event.product_id,
      count(distinct event.source || ':' || event.source_document_id::text)
        ::integer as history_event_count,
      count(distinct event.source_document_id) filter (
        where event.source = 'historical_nfe'
      )::integer as historical_nfe_count,
      count(distinct event.source_document_id) filter (
        where event.source = 'receipt'
      )::integer as receipt_count
    from historical_events event
    group by event.product_id
  ),
  supplier_counts as (
    select
      event.product_id,
      event.supplier_id,
      count(distinct event.source || ':' || event.source_document_id::text)
        as event_count,
      max(event.occurred_at) as last_occurred_at
    from historical_events event
    where event.supplier_id is not null
    group by event.product_id, event.supplier_id
  ),
  preferred_suppliers as (
    select ranked.product_id, ranked.supplier_id
    from (
      select
        counted.*,
        row_number() over (
          partition by counted.product_id
          order by counted.event_count desc, counted.last_occurred_at desc
        ) as position
      from supplier_counts counted
    ) ranked
    where ranked.position = 1
  ),
  current_cycle as (
    select
      event.product_id,
      case
        when bool_and(event.quantity_reliable)
          then coalesce(sum(event.purchase_quantity), 0)::numeric
        else 0::numeric
      end as quantity,
      bool_and(event.quantity_reliable) as quantity_reliable,
      true as has_purchase
    from public.v_purchase_demand_events event
    where event.company_id = p_company_id
      and event.occurred_at >=
        v_current_week::timestamp at time zone v_timezone
    group by event.product_id
  ),
  received_by_revision_item as (
    select
      receipt_item.order_revision_item_id,
      sum(receipt_item.logistic_quantity_received)::numeric as quantity
    from public.receipt_items receipt_item
    join public.receipts receipt
      on receipt.company_id = receipt_item.company_id
     and receipt.id = receipt_item.receipt_id
     and receipt.status = 'posted'
    where receipt_item.company_id = p_company_id
    group by receipt_item.order_revision_item_id
  ),
  open_orders as (
    select
      revision_item.product_id,
      sum(greatest(
        revision_item.requested_quantity - coalesce(received.quantity, 0), 0
      ))::numeric as quantity
    from public.orders purchase_order
    join public.order_revision_items revision_item
      on revision_item.company_id = purchase_order.company_id
     and revision_item.order_revision_id = purchase_order.current_revision_id
    join public.products product
      on product.company_id = revision_item.company_id
     and product.id = revision_item.product_id
     and product.purchase_unit_id = revision_item.purchase_unit_id
    left join received_by_revision_item received
      on received.order_revision_item_id = revision_item.id
    where purchase_order.company_id = p_company_id
      and purchase_order.status in (
        'draft', 'awaiting_confirmation', 'awaiting_delivery',
        'partially_received'
      )
    group by revision_item.product_id
  ),
  open_quotations as (
    select
      quotation_item.product_id,
      sum(quotation_item.requested_quantity)::numeric as quantity
    from public.quotation_items quotation_item
    join public.purchase_rounds round
      on round.company_id = quotation_item.company_id
     and round.id = quotation_item.purchase_round_id
     and round.status in ('draft', 'active')
    join public.products product
      on product.company_id = quotation_item.company_id
     and product.id = quotation_item.product_id
     and product.purchase_unit_id = quotation_item.purchase_unit_id
    where quotation_item.company_id = p_company_id
      and quotation_item.commercial_status = 'open'
    group by quotation_item.product_id
  ),
  pending_list as (
    select
      list_item.product_id,
      sum(list_item.requested_quantity)::numeric as quantity
    from public.shopping_list_items list_item
    join public.shopping_lists list
      on list.company_id = list_item.company_id
     and list.id = list_item.shopping_list_id
     and list.status = 'open'
    join public.products product
      on product.company_id = list_item.company_id
     and product.id = list_item.product_id
     and product.purchase_unit_id = list_item.purchase_unit_id
    where list_item.company_id = p_company_id
      and list_item.status = 'pending'
    group by list_item.product_id
  ),
  candidates as (
    select
      product.id as product_id,
      product.name as product_name,
      product.category_id,
      purchase_unit.symbol as purchase_unit,
      cadence.expected_quantity,
      coalesce(current_purchase.quantity, 0)::numeric as current_quantity,
      coalesce(open_order.quantity, 0)::numeric as order_quantity,
      coalesce(open_quotation.quantity, 0)::numeric as quotation_quantity,
      coalesce(list_quantity.quantity, 0)::numeric as list_quantity,
      cadence.active_weeks,
      cadence.observed_weeks,
      cadence.variation_percent,
      cadence.last_occurred_at,
      cadence.cadence_weeks,
      cadence.cadence_confidence_percent,
      sources.history_event_count,
      sources.historical_nfe_count,
      sources.receipt_count,
      cadence.quantity_event_count,
      cadence.quantity_event_count >= 3
        and cadence.expected_quantity > 0
        and coalesce(current_purchase.quantity_reliable, true)
        as quantity_reliable,
      coalesce(current_purchase.has_purchase, false) as current_has_purchase,
      (
        (cadence.last_occurred_at at time zone v_timezone)::date
        + (cadence.cadence_weeks * 7)
      )::date as next_expected_date,
      preferred.supplier_id as preferred_supplier_id,
      supplier.name as preferred_supplier_name
    from cadence_stats cadence
    join public.products product
      on product.company_id = p_company_id
     and product.id = cadence.product_id
     and product.is_active
    join public.units purchase_unit
      on purchase_unit.company_id = product.company_id
     and purchase_unit.id = product.purchase_unit_id
    join history_sources sources on sources.product_id = product.id
    left join current_cycle current_purchase
      on current_purchase.product_id = product.id
    left join open_orders open_order on open_order.product_id = product.id
    left join open_quotations open_quotation
      on open_quotation.product_id = product.id
    left join pending_list list_quantity on list_quantity.product_id = product.id
    left join preferred_suppliers preferred
      on preferred.product_id = product.id
    left join public.suppliers supplier
      on supplier.company_id = p_company_id
     and supplier.id = preferred.supplier_id
    where cadence.active_weeks >= 3
      and cadence.cadence_confidence_percent >= 60
      and (cadence.last_occurred_at at time zone v_timezone)::date >=
        v_today - (cadence.cadence_weeks * 21)
  )
  select
    candidate.product_id,
    candidate.product_name,
    candidate.category_id,
    candidate.purchase_unit,
    round(candidate.expected_quantity, 3),
    round(candidate.current_quantity, 3),
    round(candidate.order_quantity, 3),
    round(candidate.quotation_quantity, 3),
    round(candidate.list_quantity, 3),
    candidate.active_weeks,
    candidate.observed_weeks,
    round(candidate.variation_percent, 1),
    case
      when candidate.active_weeks >= 6
       and candidate.cadence_confidence_percent >= 75
       and (
         not candidate.quantity_reliable
         or candidate.variation_percent <= 25
       ) then 'high'
      else 'medium'
    end,
    candidate.last_occurred_at,
    candidate.cadence_weeks,
    round(candidate.cadence_confidence_percent, 0),
    candidate.history_event_count,
    candidate.historical_nfe_count,
    candidate.receipt_count,
    candidate.quantity_event_count,
    candidate.quantity_reliable,
    candidate.current_has_purchase,
    candidate.next_expected_date,
    candidate.preferred_supplier_id,
    candidate.preferred_supplier_name
  from candidates candidate
  where candidate.next_expected_date <= v_current_week + 6
    and not exists (
      select 1
      from public.purchase_suggestion_events suggestion_event
      where suggestion_event.company_id = p_company_id
        and suggestion_event.product_id = candidate.product_id
        and suggestion_event.valid_until >= v_today
    )
    and (
      candidate.quantity_reliable
      or (
        not candidate.current_has_purchase
        and candidate.order_quantity = 0
        and candidate.quotation_quantity = 0
        and candidate.list_quantity = 0
      )
    )
  order by
    case
      when candidate.active_weeks >= 6
       and candidate.cadence_confidence_percent >= 75 then 0
      else 1
    end,
    candidate.next_expected_date,
    candidate.history_event_count desc,
    candidate.product_name
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_purchase_demand_baselines(
  uuid, integer, integer
) from public, anon;
grant execute on function public.rpc_get_purchase_demand_baselines(
  uuid, integer, integer
) to authenticated, service_role;

-- A origem registrada na lista passa a refletir a linha do tempo unificada,
-- que pode conter tanto recebimentos quanto NF-e historicas.
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
    or coalesce(
      private.has_permission(p_company_id, 'purchase_round.create'), false
    )
    or coalesce(private.has_permission(p_company_id, 'order.create'), false)
  ) then
    raise exception 'Sem permissao para alterar a lista de compras';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select product.purchase_unit_id
  into v_purchase_unit_id
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
    and product.is_active;

  if v_purchase_unit_id is null then
    raise exception 'Produto nao encontrado ou desativado';
  end if;

  select coalesce(nullif(company.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies company
  where company.id = p_company_id;

  v_valid_until :=
    date_trunc('week', now() at time zone v_timezone)::date + 6;

  insert into public.purchase_suggestion_events (
    company_id, product_id, action, suggested_quantity,
    chosen_quantity, valid_until, created_by
  ) values (
    p_company_id, p_product_id, 'accepted', p_suggested_quantity,
    p_quantity, v_valid_until, auth.uid()
  )
  on conflict (company_id, product_id, action, valid_until) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select list_item.id into v_item_id
    from public.shopping_list_items list_item
    join public.shopping_lists list
      on list.company_id = list_item.company_id
     and list.id = list_item.shopping_list_id
    where list_item.company_id = p_company_id
      and list_item.product_id = p_product_id
      and list_item.status = 'pending'
      and list.status = 'open'
    limit 1;
    return v_item_id;
  end if;

  select list.id into v_list_id
  from public.shopping_lists list
  where list.company_id = p_company_id and list.status = 'open'
  for update;

  if v_list_id is null then
    begin
      insert into public.shopping_lists (company_id, name, created_by)
      values (p_company_id, 'Lista atual', auth.uid())
      returning id into v_list_id;
    exception when unique_violation then
      select list.id into v_list_id
      from public.shopping_lists list
      where list.company_id = p_company_id and list.status = 'open';
    end;
  end if;

  insert into public.shopping_list_items (
    company_id, shopping_list_id, product_id, requested_quantity,
    purchase_unit_id, notes, added_by
  ) values (
    p_company_id, v_list_id, p_product_id, p_quantity,
    v_purchase_unit_id, 'Sugestao baseada no historico de compras', auth.uid()
  )
  on conflict (shopping_list_id, product_id) where status = 'pending'
  do update set
    requested_quantity =
      public.shopping_list_items.requested_quantity
      + excluded.requested_quantity,
    updated_at = now()
  returning id into v_item_id;

  return v_item_id;
end;
$$;

commit;
