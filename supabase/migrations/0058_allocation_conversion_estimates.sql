-- 0058_allocation_conversion_estimates.sql
--
-- Quantidade comprada e quantidade precificada não são necessariamente a
-- mesma coisa. Uma metade suína pode ser comprada por unidade e precificada
-- por kg; uma caixa pode ter peso médio. Sem congelar essa estimativa na
-- decisão, totais e economia parecem exatos, mas estão multiplicando unidades
-- incompatíveis.

begin;

alter table public.purchase_allocations
  add column estimated_pricing_source text
  check (estimated_pricing_source in (
    'same_unit',
    'supplier_factor',
    'round_estimate',
    'product_default',
    'unavailable'
  ));

comment on column public.purchase_allocations.estimated_pricing_source is
  'Origem do fator usado para transformar quantidade comprada em quantidade precificada.';

alter table public.order_revision_items
  add column estimated_pricing_source text
  check (estimated_pricing_source in (
    'same_unit',
    'supplier_factor',
    'round_estimate',
    'product_default',
    'unavailable'
  ));

comment on column public.order_revision_items.estimated_pricing_source is
  'Snapshot da origem da quantidade estimada na unidade de preço.';

create or replace function private.fill_allocation_pricing_estimate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_factor numeric;
begin
  select
    qi.purchase_unit_id,
    qi.pricing_unit_id,
    qi.estimated_conversion_rate,
    qi.product_id
  into v_item
  from public.quotation_items qi
  where qi.company_id = new.company_id
    and qi.id = new.quotation_item_id;

  if v_item.purchase_unit_id is null then
    return new;
  end if;

  if v_item.purchase_unit_id = v_item.pricing_unit_id then
    new.estimated_pricing_quantity := new.allocated_quantity;
    new.estimated_pricing_source := 'same_unit';
    return new;
  end if;

  -- O fator declarado pelo fornecedor é o mais específico: peso da caixa,
  -- quantidade por pacote ou outra conversão daquela proposta.
  select rav.value_numeric
  into v_factor
  from public.quotation_response_attribute_values rav
  join public.product_attribute_definitions def
    on def.company_id = rav.company_id
   and def.id = rav.attribute_definition_id
  where rav.company_id = new.company_id
    and rav.quotation_response_item_id = new.quotation_response_item_id
    and def.is_conversion_factor = true
    and def.is_active = true
    and rav.value_numeric > 0
  order by rav.created_at desc
  limit 1;

  if v_factor is not null then
    new.estimated_pricing_quantity := new.allocated_quantity * v_factor;
    new.estimated_pricing_source := 'supplier_factor';
    return new;
  end if;

  if v_item.estimated_conversion_rate is not null
     and v_item.estimated_conversion_rate > 0 then
    new.estimated_pricing_quantity :=
      new.allocated_quantity * v_item.estimated_conversion_rate;
    new.estimated_pricing_source := 'round_estimate';
    return new;
  end if;

  -- O valor do cadastro é um padrão de último recurso. Ele é congelado na
  -- alocação; mudar o produto amanhã não reescreve a decisão de hoje.
  select pav.value_numeric
  into v_factor
  from public.product_attribute_values pav
  join public.product_attribute_definitions def
    on def.company_id = pav.company_id
   and def.id = pav.attribute_definition_id
  where pav.company_id = new.company_id
    and pav.product_id = v_item.product_id
    and def.is_conversion_factor = true
    and def.is_active = true
    and pav.value_numeric > 0
  order by
    case when def.product_id is not null then 0 else 1 end,
    pav.updated_at desc
  limit 1;

  if v_factor is not null then
    new.estimated_pricing_quantity := new.allocated_quantity * v_factor;
    new.estimated_pricing_source := 'product_default';
  else
    new.estimated_pricing_quantity := null;
    new.estimated_pricing_source := 'unavailable';
  end if;

  return new;
end;
$$;

create trigger purchase_allocations_fill_pricing_estimate
before insert or update of
  allocated_quantity,
  quotation_item_id,
  quotation_response_item_id,
  estimated_pricing_quantity
on public.purchase_allocations
for each row execute function private.fill_allocation_pricing_estimate();

revoke all on function private.fill_allocation_pricing_estimate()
from public, anon, authenticated;

create or replace function private.copy_allocation_estimate_to_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantity numeric;
  v_source text;
begin
  if new.purchase_allocation_id is null then
    return new;
  end if;

  select pa.estimated_pricing_quantity, pa.estimated_pricing_source
  into v_quantity, v_source
  from public.purchase_allocations pa
  where pa.company_id = new.company_id
    and pa.id = new.purchase_allocation_id;

  new.estimated_pricing_quantity := coalesce(
    new.estimated_pricing_quantity,
    v_quantity
  );
  new.estimated_pricing_source := v_source;
  return new;
end;
$$;

create trigger order_revision_items_copy_pricing_estimate
before insert or update of purchase_allocation_id, estimated_pricing_quantity
on public.order_revision_items
for each row execute function private.copy_allocation_estimate_to_order_item();

revoke all on function private.copy_allocation_estimate_to_order_item()
from public, anon, authenticated;

-- Dispara o cálculo para o histórico existente sem alterar a quantidade.
update public.purchase_allocations
set estimated_pricing_quantity = estimated_pricing_quantity;

-- Revisões enviadas ou confirmadas são snapshots comerciais imutáveis. O
-- backfill só alcança rascunhos; revisões históricas conservam a quantidade
-- que já possuíam e ficam sem a nova informação de origem. Novos itens passam
-- a recebê-la pelo trigger acima no momento da criação.
update public.order_revision_items ori
set estimated_pricing_quantity = coalesce(
      ori.estimated_pricing_quantity,
      pa.estimated_pricing_quantity
    ),
    estimated_pricing_source = pa.estimated_pricing_source
from public.purchase_allocations pa,
     public.order_revisions revision
where pa.company_id = ori.company_id
  and pa.id = ori.purchase_allocation_id
  and revision.company_id = ori.company_id
  and revision.id = ori.order_revision_id
  and revision.status = 'draft';

commit;
