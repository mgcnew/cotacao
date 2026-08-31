-- 0088_packaging_presentation_confirmation.sql
-- Confirmação explícita e auditável de apresentações reaproveitadas.

begin;

alter table public.quotation_response_attribute_values
  add column if not exists value_origin text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists source_attribute_value_id uuid;

update public.quotation_response_attribute_values
set value_origin = coalesce(value_origin, 'entered'),
    confirmed_at = coalesce(confirmed_at, created_at);

alter table public.quotation_response_attribute_values
  alter column value_origin set default 'entered',
  alter column value_origin set not null,
  alter column confirmed_at set default now(),
  alter column confirmed_at set not null;

alter table public.quotation_response_attribute_values
  drop constraint if exists quotation_response_attribute_values_origin_check;
alter table public.quotation_response_attribute_values
  add constraint quotation_response_attribute_values_origin_check
  check (value_origin in ('entered', 'historical_confirmed', 'updated'));

alter table public.quotation_response_attribute_values
  drop constraint if exists quotation_response_attribute_values_source_fkey;
alter table public.quotation_response_attribute_values
  add constraint quotation_response_attribute_values_source_fkey
  foreign key (source_attribute_value_id)
  references public.quotation_response_attribute_values(id)
  on delete set null;

create or replace function private.classify_response_attribute_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_product_id uuid;
  v_previous public.quotation_response_attribute_values;
begin
  select rs.supplier_id, qi.product_id
  into v_supplier_id, v_product_id
  from public.quotation_response_items qri
  join public.quotation_responses qr
    on qr.id = qri.quotation_response_id
   and qr.company_id = qri.company_id
  join public.round_suppliers rs
    on rs.id = qr.round_supplier_id
   and rs.company_id = qr.company_id
  join public.supplier_quotation_items sqi
    on sqi.id = qri.supplier_quotation_item_id
   and sqi.company_id = qri.company_id
  join public.quotation_items qi
    on qi.id = sqi.quotation_item_id
   and qi.company_id = sqi.company_id
  where qri.id = new.quotation_response_item_id
    and qri.company_id = new.company_id;

  select previous_value.*
  into v_previous
  from public.quotation_response_attribute_values previous_value
  join public.quotation_response_items previous_item
    on previous_item.id = previous_value.quotation_response_item_id
   and previous_item.company_id = previous_value.company_id
  join public.quotation_responses previous_response
    on previous_response.id = previous_item.quotation_response_id
   and previous_response.company_id = previous_item.company_id
  join public.round_suppliers previous_supplier
    on previous_supplier.id = previous_response.round_supplier_id
   and previous_supplier.company_id = previous_response.company_id
  join public.supplier_quotation_items previous_sqi
    on previous_sqi.id = previous_item.supplier_quotation_item_id
   and previous_sqi.company_id = previous_item.company_id
  join public.quotation_items previous_qi
    on previous_qi.id = previous_sqi.quotation_item_id
   and previous_qi.company_id = previous_sqi.company_id
  where previous_value.company_id = new.company_id
    and previous_value.attribute_definition_id = new.attribute_definition_id
    and previous_supplier.supplier_id = v_supplier_id
    and previous_qi.product_id = v_product_id
    and previous_value.id <> new.id
  order by previous_value.confirmed_at desc, previous_value.created_at desc
  limit 1;

  new.confirmed_at := now();
  new.source_attribute_value_id := v_previous.id;

  if v_previous.id is null then
    new.value_origin := case
      when tg_op = 'UPDATE'
        and (
          new.value_text is distinct from old.value_text
          or new.value_numeric is distinct from old.value_numeric
          or new.value_boolean is distinct from old.value_boolean
        )
      then 'updated'
      else 'entered'
    end;
  elsif new.value_text is not distinct from v_previous.value_text
    and new.value_numeric is not distinct from v_previous.value_numeric
    and new.value_boolean is not distinct from v_previous.value_boolean then
    new.value_origin := 'historical_confirmed';
  else
    new.value_origin := 'updated';
  end if;

  return new;
end;
$$;

drop trigger if exists quotation_response_attributes_classify
on public.quotation_response_attribute_values;
create trigger quotation_response_attributes_classify
before insert or update of value_text, value_numeric, value_boolean
on public.quotation_response_attribute_values
for each row execute function private.classify_response_attribute_value();

revoke all on function private.classify_response_attribute_value()
from public, anon, authenticated;

create or replace function public.rpc_public_get_quotation_conversion_context(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  select coalesce(jsonb_agg(jsonb_build_object(
    'supplier_quotation_item_id', current_sqi.id,
    'attribute_definition_id', pad.id,
    'suggested_value_numeric', previous_value.value_numeric,
    'suggested_confirmed_at', previous_value.confirmed_at
  )), '[]'::jsonb)
  into v_result
  from public.supplier_quotation_items current_sqi
  join public.quotation_items qi
    on qi.id = current_sqi.quotation_item_id
   and qi.company_id = current_sqi.company_id
  join public.products p
    on p.id = qi.product_id
   and p.company_id = qi.company_id
  join public.product_attribute_definitions pad
    on pad.company_id = p.company_id
   and pad.is_active = true
   and pad.is_conversion_factor = true
   and (pad.product_id = p.id or pad.category_id = p.category_id)
  left join lateral (
    select rav.value_numeric, rav.confirmed_at
    from public.quotation_response_attribute_values rav
    join public.quotation_response_items previous_item
      on previous_item.id = rav.quotation_response_item_id
     and previous_item.company_id = rav.company_id
    join public.supplier_quotation_items previous_sqi
      on previous_sqi.id = previous_item.supplier_quotation_item_id
     and previous_sqi.company_id = previous_item.company_id
    join public.quotation_items previous_qi
      on previous_qi.id = previous_sqi.quotation_item_id
     and previous_qi.company_id = previous_sqi.company_id
    join public.quotation_responses previous_response
      on previous_response.id = previous_item.quotation_response_id
     and previous_response.company_id = previous_item.company_id
    join public.round_suppliers previous_supplier
      on previous_supplier.id = previous_response.round_supplier_id
     and previous_supplier.company_id = previous_response.company_id
    where rav.company_id = v_token.company_id
      and rav.attribute_definition_id = pad.id
      and rav.value_numeric > 0
      and previous_supplier.supplier_id = v_token.supplier_id
      and previous_qi.product_id = p.id
    order by rav.confirmed_at desc, rav.created_at desc
    limit 1
  ) previous_value on true
  where current_sqi.company_id = v_token.company_id
    and current_sqi.round_supplier_id = v_token.round_supplier_id
    and current_sqi.removed_at is null;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_quotation_conversion_context(text)
from public;
grant execute on function public.rpc_public_get_quotation_conversion_context(text)
to anon, authenticated;

-- Apresentação congelada no pedido. Se o fornecedor disser que mudou, usa o
-- fluxo de divergência e o pedido não é confirmado silenciosamente.
create or replace function public.rpc_public_get_order_packaging_context(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'order_confirmation');

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_revision_item_id', ori.id,
    'quantity_per_package', rav.value_numeric,
    'comparison_unit_symbol', comparison_unit.symbol,
    'confirmed_at', rav.confirmed_at
  ) order by ori.created_at), '[]'::jsonb)
  into v_result
  from public.order_revision_items ori
  join public.products product
    on product.id = ori.product_id
   and product.company_id = ori.company_id
   and product.purpose = 'packaging'
  join public.purchase_allocations allocation
    on allocation.id = ori.purchase_allocation_id
   and allocation.company_id = ori.company_id
  join public.quotation_response_attribute_values rav
    on rav.quotation_response_item_id = allocation.quotation_response_item_id
   and rav.company_id = allocation.company_id
  join public.product_attribute_definitions pad
    on pad.id = rav.attribute_definition_id
   and pad.company_id = rav.company_id
   and pad.is_conversion_factor = true
  join public.units comparison_unit
    on comparison_unit.id = ori.comparison_unit_id
   and comparison_unit.company_id = ori.company_id
  where ori.company_id = v_token.company_id
    and ori.order_revision_id = v_token.order_revision_id
    and rav.value_numeric > 0;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_order_packaging_context(text)
from public;
grant execute on function public.rpc_public_get_order_packaging_context(text)
to anon, authenticated;

create or replace function public.rpc_public_confirm_order_validated(
  p_token text,
  p_packaging_presentations_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_has_packaging boolean;
begin
  v_token := private.resolve_public_token(p_token, 'order_confirmation');

  select exists (
    select 1
    from public.order_revision_items ori
    join public.products product
      on product.id = ori.product_id
     and product.company_id = ori.company_id
     and product.purpose = 'packaging'
    join public.purchase_allocations allocation
      on allocation.id = ori.purchase_allocation_id
     and allocation.company_id = ori.company_id
    join public.quotation_response_attribute_values rav
      on rav.quotation_response_item_id = allocation.quotation_response_item_id
     and rav.company_id = allocation.company_id
    join public.product_attribute_definitions pad
      on pad.id = rav.attribute_definition_id
     and pad.company_id = rav.company_id
     and pad.is_conversion_factor = true
    where ori.company_id = v_token.company_id
      and ori.order_revision_id = v_token.order_revision_id
      and rav.value_numeric > 0
  ) into v_has_packaging;

  if v_has_packaging and not coalesce(p_packaging_presentations_confirmed, false) then
    raise exception 'Confirme que as apresentações das embalagens permanecem iguais';
  end if;

  return public.rpc_public_confirm_order(p_token);
end;
$$;

revoke all on function public.rpc_public_confirm_order_validated(text,boolean)
from public;
grant execute on function public.rpc_public_confirm_order_validated(text,boolean)
to anon, authenticated;

revoke execute on function public.rpc_public_confirm_order(text)
from anon, authenticated;

commit;
