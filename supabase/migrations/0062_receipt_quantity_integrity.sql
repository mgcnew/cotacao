-- 0062_receipt_quantity_integrity.sql
--
-- Quando compra e precificacao usam a mesma unidade, as duas quantidades
-- representam a mesma medida. Mantemos essa regra no banco para que nenhum
-- cliente, RPC ou integracao consiga gravar valores divergentes.

begin;

create or replace function private.align_same_unit_receipt_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_same_unit boolean;
begin
  select ori.purchase_unit_id = ori.pricing_unit_id
    into v_same_unit
  from public.order_revision_items ori
  where ori.company_id = new.company_id
    and ori.id = new.order_revision_item_id;

  if coalesce(v_same_unit, false) then
    new.pricing_quantity_received := new.logistic_quantity_received;
  end if;

  return new;
end;
$$;

revoke all on function private.align_same_unit_receipt_quantity()
from public, anon, authenticated;

drop trigger if exists receipt_items_align_same_unit_quantity
on public.receipt_items;

create trigger receipt_items_align_same_unit_quantity
before insert or update of
  order_revision_item_id,
  logistic_quantity_received,
  pricing_quantity_received
on public.receipt_items
for each row execute function private.align_same_unit_receipt_quantity();

-- Repara os recebimentos antigos afetados. O update passa pela trigger acima,
-- portanto a mesma regra usada daqui em diante tambem corrige o historico.
update public.receipt_items ri
set pricing_quantity_received = ri.logistic_quantity_received
from public.order_revision_items ori
where ori.company_id = ri.company_id
  and ori.id = ri.order_revision_item_id
  and ori.purchase_unit_id = ori.pricing_unit_id
  and ri.pricing_quantity_received is distinct from ri.logistic_quantity_received;

-- Divergencias financeiras guardam o impacto calculado. Depois da correcao da
-- quantidade, sincronizamos esse valor para nao deixar um total antigo salvo.
update public.commercial_divergences cd
set financial_impact =
  (ri.practiced_price - ori.agreed_price) * ri.pricing_quantity_received
from public.receipt_items ri
join public.order_revision_items ori
  on ori.company_id = ri.company_id
 and ori.id = ri.order_revision_item_id
where cd.company_id = ri.company_id
  and cd.receipt_item_id = ri.id
  and cd.type = 'price';

commit;
