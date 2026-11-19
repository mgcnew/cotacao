-- Recibo persistente e comparação opcional por faixas, sem revelar concorrentes.
begin;

alter table public.purchase_rounds
  add column show_supplier_price_feedback boolean not null default false;

create function public.rpc_public_get_quotation_receipt(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_token public.public_access_tokens;
  v_enabled boolean;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');
  select round.show_supplier_price_feedback into v_enabled
  from public.round_suppliers participant
  join public.purchase_rounds round on round.company_id = participant.company_id
    and round.id = participant.purchase_round_id
  where participant.company_id = v_token.company_id and participant.id = v_token.round_supplier_id;

  with scope as (
    select qi.*, product.purpose, product.category_id,
      definition.id as factor_definition_id, definition.unit_id as factor_unit_id,
      (qi.purchase_form_id is not null
       or (qi.comparison_unit_id is not null and qi.pricing_unit_id <> qi.comparison_unit_id)
       or (product.purpose = 'packaging' and qi.purchase_unit_id <> qi.pricing_unit_id
           and qi.comparison_unit_id is null and definition.unit_id = qi.pricing_unit_id)) as needs_factor
    from public.quotation_items qi
    join public.products product on product.company_id = qi.company_id and product.id = qi.product_id
    left join lateral (
      select def.id, def.unit_id from public.product_attribute_definitions def
      where def.company_id = qi.company_id and def.is_active and def.is_conversion_factor
        and (def.product_id = qi.product_id or def.category_id = product.category_id)
      order by (def.product_id = qi.product_id) desc nulls last, def.sort_order, def.id limit 1
    ) definition on true
    where qi.company_id = v_token.company_id
      and exists (select 1 from public.supplier_quotation_items own
        where own.company_id = qi.company_id and own.quotation_item_id = qi.id
          and own.round_supplier_id = v_token.round_supplier_id and own.removed_at is null)
  ), offers as (
    select qi.id as item_id, participant.supplier_id,
      case when participant.supplier_id = v_token.supplier_id then response.quoted_price else prices.current_price end as current_price,
      case when not coalesce(qi.needs_factor, false) then (case when participant.supplier_id = v_token.supplier_id then response.quoted_price else prices.current_price end)
        when qi.purchase_form_id is not null then (case when participant.supplier_id = v_token.supplier_id then response.quoted_price else prices.current_price end) / nullif(coalesce(
          response.form_base_per_unit, qi.form_base_quantity / nullif(qi.form_unit_quantity, 0)), 0)
        else (case when participant.supplier_id = v_token.supplier_id then response.quoted_price else prices.current_price end) / nullif(factor.value_numeric, 0)
      end as comparable_price
    from scope qi
    join public.supplier_quotation_items item on item.company_id = qi.company_id
      and item.quotation_item_id = qi.id and item.removed_at is null
    join public.round_suppliers participant on participant.company_id = item.company_id
      and participant.id = item.round_supplier_id and participant.removed_at is null
    join public.quotation_response_items response on response.company_id = item.company_id
      and response.supplier_quotation_item_id = item.id
    join public.v_current_response_prices prices on prices.company_id = response.company_id
      and prices.quotation_response_item_id = response.id
    left join public.quotation_response_attribute_values factor on factor.company_id = response.company_id
      and factor.quotation_response_item_id = response.id
      and factor.attribute_definition_id = qi.factor_definition_id and factor.value_numeric > 0
    where v_enabled and not response.does_not_supply and response.is_available is not false
      and prices.current_price is not null and prices.current_price > 0
  ), market as (
    select item_id, min(comparable_price) filter (where comparable_price > 0) as best,
      count(distinct supplier_id) filter (where supplier_id <> v_token.supplier_id and comparable_price > 0) as others
    from offers group by item_id
  )
  select jsonb_build_object(
    'submitted_at', response.submitted_at,
    'response_status', response.status,
    'comparison_enabled', coalesce(v_enabled, false),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', item.id, 'product_name', product.name,
        'requested_quantity', qi.requested_quantity,
        'purchase_unit', purchase.symbol, 'pricing_unit', pricing.symbol,
        'comparison_unit', comparison.symbol,
        'quoted_price', answer.quoted_price,
        'is_available', answer.is_available, 'does_not_supply', answer.does_not_supply,
        'notes', answer.notes,
        'form_base_per_unit', case when qi.purchase_form_id is not null then coalesce(
          answer.form_base_per_unit, qi.form_base_quantity / nullif(qi.form_unit_quantity, 0)) else null end,
        'attributes', coalesce((select jsonb_agg(jsonb_build_object(
          'name', def.name,
          'value', coalesce(value.value_text, value.value_numeric::text,
            case when value.value_boolean is true then 'Sim' when value.value_boolean is false then 'Não' end),
          'unit', unit.symbol
        ) order by def.sort_order, def.name)
          from public.quotation_response_attribute_values value
          join public.product_attribute_definitions def on def.company_id = value.company_id and def.id = value.attribute_definition_id
          left join public.units unit on unit.company_id = def.company_id and unit.id = def.unit_id
          where value.company_id = answer.company_id and value.quotation_response_item_id = answer.id), '[]'::jsonb),
        'comparison_band', case
          when not coalesce(v_enabled, false) or answer.does_not_supply or answer.is_available is false then null
          when own.comparable_price is null or own.comparable_price <= 0 or market.others < 1 or market.best is null then 'insufficient'
          when own.comparable_price <= market.best then 'lowest'
          when own.comparable_price <= market.best * 1.05 then 'up_to_5'
          when own.comparable_price <= market.best * 1.10 then '5_to_10'
          else 'above_10' end
      ) order by product.name, item.id)
      from public.quotation_response_items answer
      join public.supplier_quotation_items item on item.company_id = answer.company_id
        and item.id = answer.supplier_quotation_item_id and item.round_supplier_id = v_token.round_supplier_id
        and item.removed_at is null
      join public.quotation_items qi on qi.company_id = item.company_id and qi.id = item.quotation_item_id
      join public.products product on product.company_id = qi.company_id and product.id = qi.product_id
      join public.units purchase on purchase.company_id = qi.company_id and purchase.id = qi.purchase_unit_id
      join public.units pricing on pricing.company_id = qi.company_id and pricing.id = qi.pricing_unit_id
      left join public.units comparison on comparison.company_id = qi.company_id and comparison.id = qi.comparison_unit_id
      left join offers own on own.item_id = qi.id and own.supplier_id = v_token.supplier_id
      left join market on market.item_id = qi.id
      where answer.company_id = v_token.company_id and answer.quotation_response_id = response.id
    ), '[]'::jsonb)
  ) into v_result
  from public.quotation_responses response
  where response.company_id = v_token.company_id and response.round_supplier_id = v_token.round_supplier_id;

  return coalesce(v_result, jsonb_build_object('submitted_at', null, 'response_status', null,
    'comparison_enabled', coalesce(v_enabled, false), 'items', '[]'::jsonb));
end;
$$;
revoke all on function public.rpc_public_get_quotation_receipt(text) from public;
grant execute on function public.rpc_public_get_quotation_receipt(text) to anon, authenticated;
commit;
