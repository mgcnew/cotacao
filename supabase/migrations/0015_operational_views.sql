-- 0015_operational_views.sql
-- Views iniciais de leitura. SECURITY INVOKER mantém as permissões do chamador.

begin;

-- ============================================================
-- PREÇO ATUAL DE CADA RESPOSTA
-- ============================================================

create or replace view public.v_current_response_prices
with (security_invoker = true)
as
select
  qri.company_id,
  qri.id as quotation_response_item_id,
  qri.quotation_response_id,
  qri.supplier_quotation_item_id,
  qri.quoted_price,
  coalesce(last_neg.new_price, qri.quoted_price) as current_price,
  last_neg.id as last_negotiation_id,
  last_neg.created_at as last_negotiated_at
from public.quotation_response_items qri
left join lateral (
  select n.id, n.new_price, n.created_at
  from public.negotiations n
  where n.company_id = qri.company_id
    and n.quotation_response_item_id = qri.id
  order by n.created_at desc, n.id desc
  limit 1
) last_neg on true;

grant select on public.v_current_response_prices to authenticated;

-- ============================================================
-- PROGRESSO DA RODADA
-- ============================================================

create or replace view public.v_purchase_round_progress
with (security_invoker = true)
as
select
  pr.company_id,
  pr.id as purchase_round_id,
  pr.title,
  pr.status,
  count(distinct qi.id) as total_items,
  count(distinct rs.id) as total_suppliers,
  count(distinct rs.id) filter (
    where qr.status = 'completed'
  ) as suppliers_completed,
  count(distinct rs.id) filter (
    where coalesce(qr.status, 'not_started') <> 'completed'
  ) as suppliers_pending,
  count(distinct qi.id) filter (
    where qi.commercial_status = 'confirmed'
  ) as items_confirmed,
  count(distinct o.id) as orders_created
from public.purchase_rounds pr
left join public.quotation_items qi
  on qi.purchase_round_id = pr.id
 and qi.company_id = pr.company_id
left join public.round_suppliers rs
  on rs.purchase_round_id = pr.id
 and rs.company_id = pr.company_id
left join public.quotation_responses qr
  on qr.round_supplier_id = rs.id
 and qr.company_id = rs.company_id
left join public.orders o
  on o.purchase_round_id = pr.id
 and o.company_id = pr.company_id
group by pr.company_id, pr.id, pr.title, pr.status;

grant select on public.v_purchase_round_progress to authenticated;

-- ============================================================
-- STATUS DE ENTREGA / ATRASO
-- ============================================================

create or replace view public.v_order_delivery_status
with (security_invoker = true)
as
select
  o.company_id,
  o.id as order_id,
  o.order_number,
  o.supplier_id,
  o.status,
  r.id as current_revision_id,
  r.delivery_due_date,
  case
    when o.status in ('awaiting_delivery','partially_received')
     and r.delivery_due_date is not null
     and r.delivery_due_date < current_date
    then true
    else false
  end as is_overdue,
  case
    when o.status in ('awaiting_delivery','partially_received')
     and r.delivery_due_date is not null
     and r.delivery_due_date < current_date
    then current_date - r.delivery_due_date
    else 0
  end as overdue_days
from public.orders o
left join public.order_revisions r
  on r.id = o.current_revision_id
 and r.company_id = o.company_id;

grant select on public.v_order_delivery_status to authenticated;

-- ============================================================
-- HISTÓRICO DE CONVERSÃO
-- ============================================================

create or replace view public.v_conversion_history
with (security_invoker = true)
as
select
  ri.company_id,
  ori.product_id,
  o.supplier_id,
  ri.id as receipt_item_id,
  rec.received_at,
  ori.purchase_unit_id,
  ori.pricing_unit_id,
  ri.logistic_quantity_received,
  ri.pricing_quantity_received,
  case
    when ri.logistic_quantity_received > 0
    then ri.pricing_quantity_received / ri.logistic_quantity_received
    else null
  end as conversion_rate
from public.receipt_items ri
join public.receipts rec
  on rec.id = ri.receipt_id
 and rec.company_id = ri.company_id
join public.orders o
  on o.id = rec.order_id
 and o.company_id = rec.company_id
join public.order_revision_items ori
  on ori.id = ri.order_revision_item_id
 and ori.company_id = ri.company_id
where rec.status = 'posted';

grant select on public.v_conversion_history to authenticated;

-- ============================================================
-- ECONOMIA REALIZADA
-- Busca a resposta original através da allocation do item do pedido.
-- Pedidos diretos não entram nessa métrica.
-- ============================================================

create or replace view public.v_realized_savings
with (security_invoker = true)
as
select
  ri.company_id,
  rec.order_id,
  o.supplier_id,
  ori.id as order_revision_item_id,
  ori.product_id,
  qri.quoted_price,
  ori.agreed_price,
  ri.practiced_price,
  ri.pricing_quantity_received,
  (qri.quoted_price - ori.agreed_price)
    * ri.pricing_quantity_received as negotiated_savings,
  (qri.quoted_price - ri.practiced_price)
    * ri.pricing_quantity_received as realized_savings,
  (ri.practiced_price - ori.agreed_price)
    * ri.pricing_quantity_received as divergence_impact
from public.receipt_items ri
join public.receipts rec
  on rec.id = ri.receipt_id
 and rec.company_id = ri.company_id
join public.orders o
  on o.id = rec.order_id
 and o.company_id = rec.company_id
join public.order_revision_items ori
  on ori.id = ri.order_revision_item_id
 and ori.company_id = ri.company_id
join public.purchase_allocations pa
  on pa.id = ori.purchase_allocation_id
 and pa.company_id = ori.company_id
join public.quotation_response_items qri
  on qri.id = pa.quotation_response_item_id
 and qri.company_id = pa.company_id
where rec.status = 'posted';

grant select on public.v_realized_savings to authenticated;

-- ============================================================
-- ESTATÍSTICAS FORNECEDOR x PRODUTO (base objetiva)
-- ============================================================

create or replace view public.v_supplier_product_stats
with (security_invoker = true)
as
with participation as (
  select
    rs.company_id,
    rs.supplier_id,
    qi.product_id,
    count(*) as quotation_opportunities,
    count(qri.id) as responses,
    max(qr.submitted_at) as last_response_at
  from public.round_suppliers rs
  join public.supplier_quotation_items sqi
    on sqi.round_supplier_id = rs.id
   and sqi.company_id = rs.company_id
  join public.quotation_items qi
    on qi.id = sqi.quotation_item_id
   and qi.company_id = sqi.company_id
  left join public.quotation_responses qr
    on qr.round_supplier_id = rs.id
   and qr.company_id = rs.company_id
  left join public.quotation_response_items qri
    on qri.quotation_response_id = qr.id
   and qri.supplier_quotation_item_id = sqi.id
   and qri.company_id = rs.company_id
  where sqi.removed_at is null
  group by rs.company_id, rs.supplier_id, qi.product_id
),
purchases as (
  select
    o.company_id,
    o.supplier_id,
    ori.product_id,
    count(distinct o.id) as purchase_orders,
    max(rec.received_at) as last_purchase_at
  from public.orders o
  join public.order_revisions r
    on r.order_id = o.id
   and r.company_id = o.company_id
  join public.order_revision_items ori
    on ori.order_revision_id = r.id
   and ori.company_id = r.company_id
  left join public.receipt_items ri
    on ri.order_revision_item_id = ori.id
   and ri.company_id = ori.company_id
  left join public.receipts rec
    on rec.id = ri.receipt_id
   and rec.company_id = ri.company_id
   and rec.status = 'posted'
  where r.status in ('confirmed','superseded')
  group by o.company_id, o.supplier_id, ori.product_id
)
select
  sp.company_id,
  sp.supplier_id,
  sp.product_id,
  sp.status as relationship_status,
  coalesce(pt.quotation_opportunities, 0) as quotation_opportunities,
  coalesce(pt.responses, 0) as responses,
  case
    when coalesce(pt.quotation_opportunities, 0) > 0
    then pt.responses::numeric / pt.quotation_opportunities
    else null
  end as response_rate,
  pt.last_response_at,
  coalesce(pc.purchase_orders, 0) as purchase_orders,
  pc.last_purchase_at
from public.supplier_products sp
left join participation pt
  on pt.company_id = sp.company_id
 and pt.supplier_id = sp.supplier_id
 and pt.product_id = sp.product_id
left join purchases pc
  on pc.company_id = sp.company_id
 and pc.supplier_id = sp.supplier_id
 and pc.product_id = sp.product_id;

grant select on public.v_supplier_product_stats to authenticated;

commit;
