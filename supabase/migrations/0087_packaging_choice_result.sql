-- 0087_packaging_choice_result.sql
-- Resultado econômico exclusivo de produtos com purpose = 'packaging'.
-- As economias de negociação e de cotado x nota permanecem inalteradas.

begin;

alter table public.purchase_allocations
  add column if not exists packaging_selected_unit_price numeric(18,6),
  add column if not exists packaging_benchmark_unit_price numeric(18,6),
  add column if not exists packaging_comparison_quantity numeric(18,6),
  add column if not exists packaging_choice_result_estimated numeric(18,6);

comment on column public.purchase_allocations.packaging_choice_result_estimated is
  'Resultado estimado exclusivo de embalagens: (melhor alternativa por unidade - vencedor por unidade) x quantidade equivalente. Pode ser negativo.';

alter table public.purchase_allocations
  drop constraint if exists purchase_allocations_packaging_prices_check;

alter table public.purchase_allocations
  add constraint purchase_allocations_packaging_prices_check check (
    (packaging_selected_unit_price is null or packaging_selected_unit_price >= 0)
    and (packaging_benchmark_unit_price is null or packaging_benchmark_unit_price >= 0)
    and (packaging_comparison_quantity is null or packaging_comparison_quantity >= 0)
  );

create or replace function private.fill_packaging_choice_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_selected_factor numeric;
  v_benchmark numeric;
begin
  -- Limpa primeiro para que mudar uma alocação em rascunho de produto não
  -- deixe um snapshot antigo preso nela.
  new.packaging_selected_unit_price := null;
  new.packaging_benchmark_unit_price := null;
  new.packaging_comparison_quantity := null;
  new.packaging_choice_result_estimated := null;

  select
    p.purpose,
    qi.purchase_unit_id,
    qi.pricing_unit_id,
    qi.comparison_unit_id
  into v_item
  from public.quotation_items qi
  join public.products p
    on p.id = qi.product_id
   and p.company_id = qi.company_id
  where qi.company_id = new.company_id
    and qi.id = new.quotation_item_id;

  -- A regra é deliberadamente exclusiva para embalagens configuradas com
  -- compra/preço na mesma unidade e comparação em outra unidade.
  if v_item.purpose is distinct from 'packaging'
     or v_item.purchase_unit_id is distinct from v_item.pricing_unit_id
     or v_item.comparison_unit_id is null
     or v_item.comparison_unit_id = v_item.pricing_unit_id then
    return new;
  end if;

  select rav.value_numeric
  into v_selected_factor
  from public.quotation_response_attribute_values rav
  join public.product_attribute_definitions pad
    on pad.id = rav.attribute_definition_id
   and pad.company_id = rav.company_id
   and pad.is_active = true
   and pad.is_conversion_factor = true
  where rav.company_id = new.company_id
    and rav.quotation_response_item_id = new.quotation_response_item_id
    and rav.value_numeric > 0
  order by case when pad.product_id is not null then 0 else 1 end,
           rav.created_at desc
  limit 1;

  if v_selected_factor is null then
    return new;
  end if;

  new.packaging_selected_unit_price := new.selected_price / v_selected_factor;
  new.packaging_comparison_quantity :=
    new.allocated_quantity * v_selected_factor;

  -- A referência é a proposta comparável mais barata dentre os demais
  -- fornecedores. Excluir o vencedor mede a vantagem (ou desvantagem) da
  -- escolha realizada, em vez de comparar o vencedor com ele mesmo.
  select min(current_prices.current_price / alternative_factor.value_numeric)
  into v_benchmark
  from public.supplier_quotation_items sqi
  join public.quotation_response_items response_item
    on response_item.supplier_quotation_item_id = sqi.id
   and response_item.company_id = sqi.company_id
   and response_item.does_not_supply = false
   and coalesce(response_item.is_available, true) = true
  join public.v_current_response_prices current_prices
    on current_prices.quotation_response_item_id = response_item.id
   and current_prices.company_id = response_item.company_id
   and current_prices.current_price is not null
  join lateral (
    select rav.value_numeric
    from public.quotation_response_attribute_values rav
    join public.product_attribute_definitions pad
      on pad.id = rav.attribute_definition_id
     and pad.company_id = rav.company_id
     and pad.is_active = true
     and pad.is_conversion_factor = true
    where rav.company_id = response_item.company_id
      and rav.quotation_response_item_id = response_item.id
      and rav.value_numeric > 0
    order by case when pad.product_id is not null then 0 else 1 end,
             rav.created_at desc
    limit 1
  ) alternative_factor on true
  where sqi.company_id = new.company_id
    and sqi.quotation_item_id = new.quotation_item_id
    and sqi.removed_at is null
    and response_item.id <> new.quotation_response_item_id;

  if v_benchmark is null then
    return new;
  end if;

  new.packaging_benchmark_unit_price := v_benchmark;
  new.packaging_choice_result_estimated :=
    (v_benchmark - new.packaging_selected_unit_price)
    * new.packaging_comparison_quantity;

  return new;
end;
$$;

drop trigger if exists purchase_allocations_fill_packaging_choice
on public.purchase_allocations;

create trigger purchase_allocations_fill_packaging_choice
before insert or update of
  allocated_quantity,
  quotation_item_id,
  quotation_response_item_id,
  selected_price
on public.purchase_allocations
for each row execute function private.fill_packaging_choice_snapshot();

revoke all on function private.fill_packaging_choice_snapshot()
from public, anon, authenticated;

-- Rascunhos ainda são decisões editáveis e recebem o cálculo novo. Alocações
-- confirmadas antigas permanecem intocadas para não fabricar histórico com
-- propostas que podem ter mudado depois da decisão original.
update public.purchase_allocations
set allocated_quantity = allocated_quantity
where status = 'draft';

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
    * ri.pricing_quantity_received as divergence_impact,
  rec.id as receipt_id,
  rec.received_at,
  case
    when pa.packaging_selected_unit_price is not null
      and pa.packaging_benchmark_unit_price is not null
      and pa.packaging_comparison_quantity is not null
      and pa.allocated_quantity > 0
    then (
      pa.packaging_benchmark_unit_price - pa.packaging_selected_unit_price
    ) * ri.pricing_quantity_received
      * (pa.packaging_comparison_quantity / pa.allocated_quantity)
    else null
  end as packaging_choice_result
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

commit;
