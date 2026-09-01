-- Confirmação explícita das unidades sugeridas na importação e correção segura
-- de unidades de produtos que ainda não entraram no fluxo operacional.

begin;

alter table public.product_import_mappings
  add column confirmed_at timestamptz;

-- Lotes criados antes desta migration já passaram pelo fluxo antigo. Manter as
-- seções completas como confirmadas evita reabrir trabalho que já foi feito.
update public.product_import_mappings
set confirmed_at = updated_at
where category_id is not null
  and purchase_unit_id is not null
  and pricing_unit_id is not null;

create or replace function private.product_units_lock_reason(
  p_company_id uuid,
  p_product_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.quotation_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    return 'As unidades não podem mais ser alteradas porque o produto já participou de uma cotação.';
  end if;

  if exists (
    select 1
    from public.order_revision_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    return 'As unidades não podem mais ser alteradas porque o produto já participou de um pedido.';
  end if;

  if exists (
    select 1
    from public.historical_nfe_items item
    join public.historical_nfe_imports history
      on history.company_id = item.company_id
     and history.id = item.import_id
     and history.status = 'posted'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.reconciliation_status = 'matched'
  ) then
    return 'As unidades não podem mais ser alteradas porque o produto possui histórico fiscal confirmado.';
  end if;

  if exists (
    select 1
    from public.shopping_list_items item
    join public.shopping_lists list
      on list.company_id = item.company_id
     and list.id = item.shopping_list_id
     and list.status = 'open'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.status = 'pending'
  ) then
    return 'Retire o produto da lista de compras aberta antes de alterar suas unidades.';
  end if;

  return null;
end;
$$;

revoke all on function private.product_units_lock_reason(uuid, uuid)
from public, anon, authenticated;

create or replace function public.rpc_product_units_lock_reason(
  p_company_id uuid,
  p_product_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission(p_company_id, 'product.view');

  if not exists (
    select 1
    from public.products product
    where product.company_id = p_company_id
      and product.id = p_product_id
  ) then
    raise exception 'Produto não encontrado';
  end if;

  return private.product_units_lock_reason(p_company_id, p_product_id);
end;
$$;

revoke all on function public.rpc_product_units_lock_reason(uuid, uuid)
from public, anon;
grant execute on function public.rpc_product_units_lock_reason(uuid, uuid)
to authenticated;

create or replace function public.rpc_update_unused_product_units(
  p_company_id uuid,
  p_product_id uuid,
  p_purchase_unit_id uuid,
  p_pricing_unit_id uuid,
  p_comparison_unit_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_reason text;
begin
  perform private.require_permission(p_company_id, 'product.update');

  select product.*
  into v_product
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  v_reason := private.product_units_lock_reason(p_company_id, p_product_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  if not exists (
    select 1 from public.units unit
    where unit.company_id = p_company_id
      and unit.id = p_purchase_unit_id
      and (unit.is_active or unit.id = v_product.purchase_unit_id)
  ) then
    raise exception 'Escolha uma unidade de compra ativa desta empresa';
  end if;

  if not exists (
    select 1 from public.units unit
    where unit.company_id = p_company_id
      and unit.id = p_pricing_unit_id
      and (unit.is_active or unit.id = v_product.pricing_unit_id)
  ) then
    raise exception 'Escolha uma unidade de precificação ativa desta empresa';
  end if;

  if p_comparison_unit_id is not null and not exists (
    select 1 from public.units unit
    where unit.company_id = p_company_id
      and unit.id = p_comparison_unit_id
      and (unit.is_active or unit.id = v_product.comparison_unit_id)
  ) then
    raise exception 'Escolha uma unidade de comparação ativa desta empresa';
  end if;

  update public.products
  set purchase_unit_id = p_purchase_unit_id,
      pricing_unit_id = p_pricing_unit_id,
      comparison_unit_id = p_comparison_unit_id
  where company_id = p_company_id
    and id = p_product_id;

  return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.rpc_update_unused_product_units(
  uuid, uuid, uuid, uuid, uuid
) from public, anon;
grant execute on function public.rpc_update_unused_product_units(
  uuid, uuid, uuid, uuid, uuid
) to authenticated;

-- Mantém a lista paginada e acrescenta apenas a decisão pronta para a interface,
-- sem criar quatro consultas por linha no servidor Next.
create or replace function public.rpc_list_products_page(
  p_company_id uuid,
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default null,
  p_status text default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  v_search text := extensions.unaccent(
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')))
  );
  v_result jsonb;
begin
  perform private.require_permission(p_company_id, 'product.view');

  if p_status is not null and p_status not in ('ativos', 'inativos') then
    raise exception 'Situação de produto inválida';
  end if;

  with filtered_products as materialized (
    select
      p.id,
      p.name,
      p.category_id,
      p.purpose,
      p.is_active,
      p.purchase_unit_id,
      p.pricing_unit_id,
      p.comparison_unit_id
    from public.products p
    where p.company_id = p_company_id
      and (
        v_search = ''
        or pg_catalog.strpos(
          extensions.unaccent(pg_catalog.lower(p.name)),
          v_search
        ) > 0
      )
      and (
        p_status is null
        or (p_status = 'ativos' and p.is_active)
        or (p_status = 'inativos' and not p.is_active)
      )
      and (p_category_id is null or p.category_id = p_category_id)
  ),
  stats as (
    select count(*)::integer as quantity
    from filtered_products
  ),
  bounds as (
    select
      stats.quantity,
      least(
        v_page,
        greatest(ceil(stats.quantity::numeric / v_page_size)::integer, 1)
      ) as effective_page
    from stats
  ),
  page_products as (
    select filtered.*
    from filtered_products filtered
    order by filtered.name, filtered.id
    limit v_page_size
    offset ((select effective_page from bounds) - 1) * v_page_size
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', product.id,
          'name', product.name,
          'categoryId', product.category_id,
          'categoryName', category.name,
          'purpose', product.purpose,
          'isActive', product.is_active,
          'purchaseUnitCode', purchase_unit.code,
          'pricingUnitCode', pricing_unit.code,
          'comparisonUnitCode', comparison_unit.code,
          'unitsEditable', private.product_units_lock_reason(
            p_company_id,
            product.id
          ) is null
        ) order by product.name, product.id
      )
      from page_products product
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
    'total', bounds.quantity,
    'catalogTotal', (
      select count(*)::integer
      from public.products all_products
      where all_products.company_id = p_company_id
    ),
    'page', bounds.effective_page,
    'pageSize', v_page_size,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', category.id, 'name', category.name)
        order by category.name
      )
      from public.categories category
      where category.company_id = p_company_id
    ), '[]'::jsonb)
  ) into v_result
  from bounds;

  return v_result;
end;
$$;

commit;
