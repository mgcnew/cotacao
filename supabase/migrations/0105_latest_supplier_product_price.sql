-- Último preço efetivamente pago por fornecedor e produto.
--
-- Parte da visão de compras efetivas para considerar tanto recebimentos
-- registrados quanto NF-e históricas conciliadas. Pedidos apenas combinados,
-- cancelados e recebimentos em rascunho não entram nesta referência.

begin;

create or replace view public.v_latest_supplier_product_price
with (security_invoker = true)
as
select distinct on (history.company_id, history.supplier_id, history.product_id)
  history.company_id,
  history.supplier_id,
  history.product_id,
  history.practiced_price,
  history.pricing_unit_symbol,
  history.occurred_at,
  history.source
from public.v_purchase_price_history history
where history.company_id is not null
  and history.supplier_id is not null
  and history.product_id is not null
  and history.practiced_price is not null
  and history.occurred_at is not null
order by
  history.company_id,
  history.supplier_id,
  history.product_id,
  history.occurred_at desc,
  history.event_id desc;

grant select on public.v_latest_supplier_product_price to authenticated;

commit;
