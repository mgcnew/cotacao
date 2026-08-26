-- 0059_round_report_snapshots.sql
--
-- O relatório gerencial é um documento histórico. Nomes, grupos e cadastros
-- podem mudar depois; por isso a conclusão da rodada congela o que o gestor
-- deve enxergar, sem duplicar as tabelas operacionais durante o trabalho.

begin;

create table public.purchase_round_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  schema_version integer not null default 1 check (schema_version > 0),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  unique (company_id, purchase_round_id),
  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete restrict
);

create index purchase_round_report_snapshots_round_idx
on public.purchase_round_report_snapshots(purchase_round_id);

alter table public.purchase_round_report_snapshots enable row level security;
revoke all on public.purchase_round_report_snapshots from anon;
grant select on public.purchase_round_report_snapshots to authenticated;

create policy purchase_round_report_snapshots_select
on public.purchase_round_report_snapshots
for select to authenticated
using (
  (select private.is_company_member(company_id))
  and (select private.has_permission(company_id, 'purchase_allocation.view'))
);

create or replace function private.build_purchase_round_report(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
with round_info as (
  select
    pr.id,
    pr.title,
    pr.status,
    pr.notes,
    pr.created_at,
    pr.started_at,
    pr.completed_at,
    c.name as company_name
  from public.purchase_rounds pr
  join public.companies c on c.id = pr.company_id
  where pr.company_id = p_company_id
    and pr.id = p_purchase_round_id
),
items as (
  select
    qi.id,
    qi.group_id,
    qi.requested_quantity,
    qi.commercial_status,
    qi.created_at,
    p.name as product_name,
    g.name as group_name,
    g.sort_order as group_sort,
    pu.symbol as purchase_unit,
    pru.symbol as pricing_unit
  from public.quotation_items qi
  join public.products p
    on p.company_id = qi.company_id and p.id = qi.product_id
  join public.purchase_round_groups g
    on g.company_id = qi.company_id and g.id = qi.group_id
  join public.units pu
    on pu.company_id = qi.company_id and pu.id = qi.purchase_unit_id
  join public.units pru
    on pru.company_id = qi.company_id and pru.id = qi.pricing_unit_id
  where qi.company_id = p_company_id
    and qi.purchase_round_id = p_purchase_round_id
    and qi.commercial_status <> 'cancelled'
),
suppliers as (
  select rs.id as round_supplier_id, rs.supplier_id, s.name
  from public.round_suppliers rs
  join public.suppliers s
    on s.company_id = rs.company_id and s.id = rs.supplier_id
  where rs.company_id = p_company_id
    and rs.purchase_round_id = p_purchase_round_id
),
allocation_summary as (
  select
    pa.quotation_item_id,
    pa.supplier_id,
    sum(pa.allocated_quantity) as won_quantity,
    sum(pa.estimated_pricing_quantity) as estimated_pricing_quantity,
    bool_and(pa.estimated_pricing_quantity is not null) as calculable,
    case
      when bool_and(pa.estimated_pricing_quantity is not null)
       and sum(pa.estimated_pricing_quantity) > 0
      then sum(pa.selected_price * pa.estimated_pricing_quantity)
        / sum(pa.estimated_pricing_quantity)
      else sum(pa.selected_price * pa.allocated_quantity)
        / sum(pa.allocated_quantity)
    end as selected_price
  from public.purchase_allocations pa
  where pa.company_id = p_company_id
    and pa.purchase_round_id = p_purchase_round_id
    and pa.status = 'confirmed'
  group by pa.quotation_item_id, pa.supplier_id
),
offers as (
  select
    i.id as item_id,
    s.supplier_id,
    s.name as supplier_name,
    qri.quoted_price,
    cp.current_price,
    coalesce(qri.does_not_supply, false) as does_not_supply,
    coalesce(a.won_quantity, 0) as won_quantity,
    case when coalesce(a.calculable, false)
      then a.estimated_pricing_quantity else null end
      as estimated_pricing_quantity,
    a.selected_price,
    case
      when coalesce(a.won_quantity, 0) > 0
        and coalesce(a.calculable, false)
        and qri.quoted_price is not null
      then greatest(qri.quoted_price - a.selected_price, 0)
        * a.estimated_pricing_quantity
      else null
    end as negotiated_savings,
    case
      when coalesce(a.won_quantity, 0) > 0 then 'won'
      when qri.does_not_supply = true then 'unavailable'
      when cp.current_price is not null or qri.quoted_price is not null then 'lost'
      else 'no_price'
    end as outcome
  from public.supplier_quotation_items sqi
  join items i on i.id = sqi.quotation_item_id
  join suppliers s on s.round_supplier_id = sqi.round_supplier_id
  left join public.quotation_responses qr
    on qr.company_id = sqi.company_id
   and qr.round_supplier_id = sqi.round_supplier_id
  left join public.quotation_response_items qri
    on qri.company_id = sqi.company_id
   and qri.quotation_response_id = qr.id
   and qri.supplier_quotation_item_id = sqi.id
  left join public.v_current_response_prices cp
    on cp.company_id = qri.company_id
   and cp.quotation_response_item_id = qri.id
  left join allocation_summary a
    on a.quotation_item_id = i.id
   and a.supplier_id = s.supplier_id
  where sqi.company_id = p_company_id
    and (sqi.removed_at is null or qri.id is not null)
),
item_payload as (
  select
    i.*,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'supplierId', o.supplier_id,
          'supplierName', o.supplier_name,
          'quotedPrice', o.quoted_price,
          'finalPrice', coalesce(o.current_price, o.quoted_price),
          'doesNotSupply', o.does_not_supply,
          'wonQuantity', o.won_quantity,
          'estimatedPricingQuantity', o.estimated_pricing_quantity,
          'selectedPrice', o.selected_price,
          'negotiatedSavings', o.negotiated_savings,
          'outcome', o.outcome
        ) order by o.supplier_name
      )
      from offers o where o.item_id = i.id
    ), '[]'::jsonb) as offers
  from items i
),
supplier_payload as (
  select
    s.supplier_id as id,
    s.name,
    count(*) filter (where o.outcome = 'won')::integer as wins,
    count(*) filter (where o.outcome = 'lost')::integer as losses,
    count(*) filter (where o.outcome = 'no_price')::integer as no_price,
    count(*) filter (where o.outcome = 'unavailable')::integer as unavailable,
    coalesce(sum(
      case when o.outcome = 'won' and o.estimated_pricing_quantity is not null
        then o.estimated_pricing_quantity * o.selected_price else 0 end
    ), 0) as awarded_value,
    count(*) filter (
      where o.outcome = 'won' and o.estimated_pricing_quantity is null
    )::integer as uncalculated_wins
  from suppliers s
  join offers o on o.supplier_id = s.supplier_id
  group by s.supplier_id, s.name
)
select jsonb_build_object(
  'companyName', r.company_name,
  'round', jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'status', r.status,
    'createdAt', r.created_at,
    'startedAt', r.started_at,
    'completedAt', r.completed_at,
    'notes', r.notes
  ),
  'generatedAt', now(),
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'productName', i.product_name,
      'groupName', i.group_name,
      'requestedQuantity', i.requested_quantity,
      'purchaseUnit', i.purchase_unit,
      'pricingUnit', i.pricing_unit,
      'commercialStatus', i.commercial_status,
      'offers', i.offers
    ) order by i.group_sort, i.created_at)
    from item_payload i
  ), '[]'::jsonb),
  'groups', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', grouped.group_name,
      'items', grouped.items
    ) order by grouped.group_sort)
    from (
      select
        i.group_name,
        min(i.group_sort) as group_sort,
        jsonb_agg(jsonb_build_object(
          'id', i.id,
          'productName', i.product_name,
          'groupName', i.group_name,
          'requestedQuantity', i.requested_quantity,
          'purchaseUnit', i.purchase_unit,
          'pricingUnit', i.pricing_unit,
          'commercialStatus', i.commercial_status,
          'offers', i.offers
        ) order by i.created_at) as items
      from item_payload i
      group by i.group_id, i.group_name
    ) grouped
  ), '[]'::jsonb),
  'suppliers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'wins', s.wins,
      'losses', s.losses,
      'noPrice', s.no_price,
      'unavailable', s.unavailable,
      'awardedValue', s.awarded_value,
      'uncalculatedWins', s.uncalculated_wins
    ) order by s.wins desc, s.awarded_value desc, s.name)
    from supplier_payload s
  ), '[]'::jsonb),
  'summary', jsonb_build_object(
    'itemCount', (select count(*) from item_payload),
    'purchasedItemCount', (
      select count(*) from item_payload i
      where exists (select 1 from offers o where o.item_id = i.id and o.outcome = 'won')
    ),
    'withoutPurchaseCount', (
      select count(*) from item_payload i
      where i.commercial_status = 'closed_without_purchase'
    ),
    'supplierCount', (select count(*) from supplier_payload),
    'winnerCount', (select count(*) from supplier_payload s where s.wins > 0),
    'estimatedAwardedValue', (
      select coalesce(sum(s.awarded_value), 0) from supplier_payload s
    ),
    'negotiatedSavings', (
      select coalesce(sum(o.negotiated_savings), 0) from offers o
    ),
    'calculablePurchasedItems', (
      select count(*)
      from item_payload i
      where exists (select 1 from offers o where o.item_id = i.id and o.outcome = 'won')
        and not exists (
          select 1 from offers o
          where o.item_id = i.id
            and o.outcome = 'won'
            and o.estimated_pricing_quantity is null
        )
    )
  )
)
from round_info r;
$$;

revoke all on function private.build_purchase_round_report(uuid, uuid)
from public, anon, authenticated;

create or replace function private.snapshot_completed_purchase_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and tg_op = 'INSERT' then
    insert into public.purchase_round_report_snapshots (
      company_id,
      purchase_round_id,
      report_data,
      generated_by
    ) values (
      new.company_id,
      new.id,
      private.build_purchase_round_report(new.company_id, new.id),
      auth.uid()
    ) on conflict (company_id, purchase_round_id) do nothing;
  elsif new.status = 'completed' and old.status is distinct from new.status then
    insert into public.purchase_round_report_snapshots (
      company_id,
      purchase_round_id,
      report_data,
      generated_by
    ) values (
      new.company_id,
      new.id,
      private.build_purchase_round_report(new.company_id, new.id),
      auth.uid()
    ) on conflict (company_id, purchase_round_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger purchase_rounds_snapshot_report
after insert or update of status on public.purchase_rounds
for each row execute function private.snapshot_completed_purchase_round();

revoke all on function private.snapshot_completed_purchase_round()
from public, anon, authenticated;

insert into public.purchase_round_report_snapshots (
  company_id,
  purchase_round_id,
  report_data,
  generated_by
)
select
  pr.company_id,
  pr.id,
  private.build_purchase_round_report(pr.company_id, pr.id),
  null
from public.purchase_rounds pr
where pr.status = 'completed'
on conflict (company_id, purchase_round_id) do nothing;

create or replace function public.rpc_get_purchase_round_report(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select snapshot.report_data
  from public.purchase_round_report_snapshots snapshot
  where snapshot.company_id = p_company_id
    and snapshot.purchase_round_id = p_purchase_round_id;
$$;

revoke all on function public.rpc_get_purchase_round_report(uuid, uuid)
from public, anon;
grant execute on function public.rpc_get_purchase_round_report(uuid, uuid)
to authenticated;

commit;
