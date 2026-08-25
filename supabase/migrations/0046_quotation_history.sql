-- 0046_quotation_history.sql
--
-- Uma linha por oportunidade de fornecedor x item. A view preserva os fatos
-- originais (convite, resposta, negociação, decisão, pedido e recebimento) e
-- deriva um resultado operacional sem duplicar o histórico em outra tabela.

begin;

create or replace view public.v_quotation_history
with (security_invoker = true)
as
with allocation_summary as (
  select
    pa.company_id,
    pa.quotation_response_item_id,
    sum(pa.allocated_quantity) filter (where pa.status = 'confirmed')
      as won_quantity,
    max(pa.selected_price) filter (where pa.status = 'confirmed')
      as selected_price,
    max(pa.created_at) filter (where pa.status = 'confirmed')
      as decided_at
  from public.purchase_allocations pa
  group by pa.company_id, pa.quotation_response_item_id
),
order_summary as (
  select distinct on (o.company_id, pa.quotation_response_item_id)
    o.company_id,
    pa.quotation_response_item_id,
    o.id as order_id,
    o.order_number,
    o.status as order_status
  from public.orders o
  join public.order_revisions orev
    on orev.company_id = o.company_id
   and orev.id = o.current_revision_id
  join public.order_revision_items ori
    on ori.company_id = orev.company_id
   and ori.order_revision_id = orev.id
  join public.purchase_allocations pa
    on pa.company_id = ori.company_id
   and pa.id = ori.purchase_allocation_id
  where o.status <> 'cancelled'
  order by o.company_id, pa.quotation_response_item_id, o.created_at desc
),
receipt_summary as (
  select distinct on (ri.company_id, pa.quotation_response_item_id)
    ri.company_id,
    pa.quotation_response_item_id,
    ri.practiced_price,
    r.received_at
  from public.receipt_items ri
  join public.receipts r
    on r.company_id = ri.company_id
   and r.id = ri.receipt_id
   and r.status = 'posted'
  join public.order_revision_items ori
    on ori.company_id = ri.company_id
   and ori.id = ri.order_revision_item_id
  join public.purchase_allocations pa
    on pa.company_id = ori.company_id
   and pa.id = ori.purchase_allocation_id
  order by
    ri.company_id,
    pa.quotation_response_item_id,
    r.received_at desc,
    ri.created_at desc
)
select
  sqi.company_id,
  pr.id as purchase_round_id,
  pr.title as round_title,
  pr.status as round_status,
  pr.created_at as round_created_at,
  coalesce(pr.completed_at, pr.cancelled_at) as round_finished_at,
  qi.id as quotation_item_id,
  qi.product_id,
  p.name as product_name,
  qi.requested_quantity,
  pu.symbol as purchase_unit_symbol,
  pru.symbol as pricing_unit_symbol,
  qi.commercial_status,
  rs.id as round_supplier_id,
  rs.supplier_id,
  s.name as supplier_name,
  rs.first_sent_at,
  qr.submitted_at,
  qri.id as quotation_response_item_id,
  qri.quoted_price,
  current_price.current_price,
  current_price.last_negotiated_at,
  qri.is_available,
  qri.does_not_supply,
  qri.notes as response_notes,
  coalesce(a.won_quantity, 0) as won_quantity,
  a.selected_price,
  a.decided_at,
  os.order_id,
  os.order_number,
  os.order_status,
  receipt.practiced_price,
  receipt.received_at,
  case
    when pr.status = 'cancelled' or qi.commercial_status = 'cancelled'
      then 'cancelled'
    when coalesce(a.won_quantity, 0) > 0
      then 'won'
    when qri.does_not_supply = true or qri.is_available = false
      then 'unavailable'
    when pr.status in ('draft', 'active')
      then 'in_progress'
    when qri.id is null
      then 'no_response'
    when qi.commercial_status = 'closed_without_purchase'
      then 'closed_without_purchase'
    when qri.quoted_price is not null
      then 'lost'
    else 'no_price'
  end as outcome
from public.supplier_quotation_items sqi
join public.round_suppliers rs
  on rs.company_id = sqi.company_id
 and rs.id = sqi.round_supplier_id
join public.suppliers s
  on s.company_id = rs.company_id
 and s.id = rs.supplier_id
join public.quotation_items qi
  on qi.company_id = sqi.company_id
 and qi.id = sqi.quotation_item_id
join public.purchase_rounds pr
  on pr.company_id = qi.company_id
 and pr.id = qi.purchase_round_id
join public.products p
  on p.company_id = qi.company_id
 and p.id = qi.product_id
join public.units pu
  on pu.company_id = qi.company_id
 and pu.id = qi.purchase_unit_id
join public.units pru
  on pru.company_id = qi.company_id
 and pru.id = qi.pricing_unit_id
left join public.quotation_responses qr
  on qr.company_id = rs.company_id
 and qr.round_supplier_id = rs.id
left join public.quotation_response_items qri
  on qri.company_id = sqi.company_id
 and qri.quotation_response_id = qr.id
 and qri.supplier_quotation_item_id = sqi.id
left join public.v_current_response_prices current_price
  on current_price.company_id = qri.company_id
 and current_price.quotation_response_item_id = qri.id
left join allocation_summary a
  on a.company_id = qri.company_id
 and a.quotation_response_item_id = qri.id
left join order_summary os
  on os.company_id = qri.company_id
 and os.quotation_response_item_id = qri.id
left join receipt_summary receipt
  on receipt.company_id = qri.company_id
 and receipt.quotation_response_item_id = qri.id
where sqi.removed_at is null or qri.id is not null;

grant select on public.v_quotation_history to authenticated;

create or replace function public.rpc_quotation_history_summary(
  p_company_id uuid,
  p_product_id uuid default null,
  p_supplier_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  rounds bigint,
  opportunities bigint,
  responses bigint,
  wins bigint,
  losses bigint,
  no_responses bigint,
  orders bigint,
  min_price numeric,
  max_price numeric,
  average_price numeric,
  last_price numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select h.*
    from public.v_quotation_history h
    where h.company_id = p_company_id
      and (p_product_id is null or h.product_id = p_product_id)
      and (p_supplier_id is null or h.supplier_id = p_supplier_id)
      and (p_from is null or h.round_created_at >= p_from::timestamptz)
      and (p_to is null or h.round_created_at < (p_to + 1)::timestamptz)
  )
  select
    count(distinct purchase_round_id),
    count(*),
    count(quotation_response_item_id),
    count(*) filter (where outcome = 'won'),
    count(*) filter (where outcome = 'lost'),
    count(*) filter (where outcome = 'no_response'),
    count(distinct order_id),
    min(current_price),
    max(current_price),
    avg(current_price),
    (array_agg(
      current_price
      order by coalesce(submitted_at, round_created_at) desc
    ) filter (where current_price is not null))[1]
  from filtered;
$$;

revoke all on function public.rpc_quotation_history_summary(
  uuid, uuid, uuid, date, date
) from public, anon;
grant execute on function public.rpc_quotation_history_summary(
  uuid, uuid, uuid, date, date
) to authenticated;

commit;
