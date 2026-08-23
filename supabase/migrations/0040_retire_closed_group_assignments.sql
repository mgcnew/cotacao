-- 0040_retire_closed_group_assignments.sql
--
-- Mantem round_supplier_groups alinhada ao ciclo de vida dos grupos. A 0034 ja
-- retirava os itens do link ao fechar/cancelar um grupo; esta migration faz a
-- nova configuracao fornecedor x grupo acompanhar a mesma transicao.

begin;

create or replace function private.retire_closed_round_supplier_groups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'cancelled')
     and old.status is distinct from new.status then
    update public.round_supplier_groups rsg
    set removed_at = coalesce(rsg.removed_at, now())
    where rsg.company_id = new.company_id
      and rsg.group_id = new.id
      and rsg.removed_at is null;
  end if;

  return new;
end;
$$;

revoke all on function private.retire_closed_round_supplier_groups()
from public, anon, authenticated;

create trigger purchase_round_groups_retire_supplier_assignments
after update of status on public.purchase_round_groups
for each row execute function private.retire_closed_round_supplier_groups();

-- Corrige grupos que já estavam encerrados quando a 0039 foi aplicada.
update public.round_supplier_groups rsg
set removed_at = coalesce(rsg.removed_at, now())
where rsg.removed_at is null
  and exists (
    select 1
    from public.purchase_round_groups g
    where g.company_id = rsg.company_id
      and g.id = rsg.group_id
      and g.status in ('closed', 'cancelled')
  );

-- Uma oportunidade retirada antes de resposta deixa de contar. Se houve
-- resposta, porém, ela continua compondo o histórico fornecedor x produto.
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
  where sqi.removed_at is null or qri.id is not null
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
