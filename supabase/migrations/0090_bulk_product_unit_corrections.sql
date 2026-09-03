-- Correção produtiva das unidades de vários produtos ainda sem movimentação.
-- A lista e a gravação usam a mesma regra de bloqueio criada em 0089; a RPC
-- repete a verificação dentro da transação para fechar a janela entre abrir a
-- tela e salvar.

begin;

create or replace function public.rpc_list_editable_product_units(
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_permission(p_company_id, 'product.update');

  with checked as materialized (
    select
      product.id,
      product.name,
      product.category_id,
      product.is_active,
      product.purchase_unit_id,
      product.pricing_unit_id,
      product.comparison_unit_id,
      private.product_units_lock_reason(p_company_id, product.id) as lock_reason
    from public.products product
    where product.company_id = p_company_id
  ),
  editable as (
    select checked.*
    from checked
    where checked.lock_reason is null
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', product.id,
          'name', product.name,
          'categoryId', product.category_id,
          'categoryName', category.name,
          'isActive', product.is_active,
          'purchaseUnitId', product.purchase_unit_id,
          'purchaseUnitCode', purchase_unit.code,
          'pricingUnitId', product.pricing_unit_id,
          'pricingUnitCode', pricing_unit.code,
          'comparisonUnitId', product.comparison_unit_id,
          'comparisonUnitCode', comparison_unit.code
        ) order by product.name, product.id
      )
      from editable product
      join public.categories category
        on category.company_id = p_company_id
       and category.id = product.category_id
      join public.units purchase_unit
        on purchase_unit.company_id = p_company_id
       and purchase_unit.id = product.purchase_unit_id
      join public.units pricing_unit
        on pricing_unit.company_id = p_company_id
       and pricing_unit.id = product.pricing_unit_id
      left join public.units comparison_unit
        on comparison_unit.company_id = p_company_id
       and comparison_unit.id = product.comparison_unit_id
    ), '[]'::jsonb),
    'editableCount', (select count(*)::integer from editable),
    'lockedCount', (select count(*)::integer from checked where lock_reason is not null)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_list_editable_product_units(uuid)
from public, anon;
grant execute on function public.rpc_list_editable_product_units(uuid)
to authenticated;

create or replace function public.rpc_bulk_update_unused_product_units(
  p_company_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_purchase_unit_id uuid;
  v_pricing_unit_id uuid;
  v_comparison_unit_id uuid;
  v_reason text;
  v_updated integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  perform private.require_permission(p_company_id, 'product.update');

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Envie uma lista de produtos para atualizar';
  end if;

  if jsonb_array_length(p_changes) < 1 then
    raise exception 'Nenhuma alteração foi informada';
  end if;

  if jsonb_array_length(p_changes) > 2000 then
    raise exception 'Atualize no máximo 2000 produtos por vez';
  end if;

  if (
    select count(*) <> count(distinct value ->> 'productId')
    from jsonb_array_elements(p_changes)
  ) then
    raise exception 'A lista contém produtos repetidos';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_product_id := (v_change ->> 'productId')::uuid;
    v_purchase_unit_id := (v_change ->> 'purchaseUnitId')::uuid;
    v_pricing_unit_id := (v_change ->> 'pricingUnitId')::uuid;
    v_comparison_unit_id := nullif(v_change ->> 'comparisonUnitId', '')::uuid;

    select product.*
    into v_product
    from public.products product
    where product.company_id = p_company_id
      and product.id = v_product_id
    for update;

    if not found then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'productId', v_product_id,
        'productName', null,
        'reason', 'Produto não encontrado nesta empresa.'
      ));
      continue;
    end if;

    v_reason := private.product_units_lock_reason(p_company_id, v_product_id);
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product.name,
        'reason', v_reason
      ));
      continue;
    end if;

    if not exists (
      select 1 from public.units unit
      where unit.company_id = p_company_id
        and unit.id = v_purchase_unit_id
        and (unit.is_active or unit.id = v_product.purchase_unit_id)
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product.name,
        'reason', 'A unidade de compra escolhida não está ativa.'
      ));
      continue;
    end if;

    if not exists (
      select 1 from public.units unit
      where unit.company_id = p_company_id
        and unit.id = v_pricing_unit_id
        and (unit.is_active or unit.id = v_product.pricing_unit_id)
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product.name,
        'reason', 'A unidade de precificação escolhida não está ativa.'
      ));
      continue;
    end if;

    if v_comparison_unit_id is not null and not exists (
      select 1 from public.units unit
      where unit.company_id = p_company_id
        and unit.id = v_comparison_unit_id
        and (unit.is_active or unit.id = v_product.comparison_unit_id)
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product.name,
        'reason', 'A unidade de comparação escolhida não está ativa.'
      ));
      continue;
    end if;

    update public.products
    set purchase_unit_id = v_purchase_unit_id,
        pricing_unit_id = v_pricing_unit_id,
        comparison_unit_id = v_comparison_unit_id
    where company_id = p_company_id
      and id = v_product_id;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.rpc_bulk_update_unused_product_units(uuid, jsonb)
from public, anon;
grant execute on function public.rpc_bulk_update_unused_product_units(uuid, jsonb)
to authenticated;

commit;
