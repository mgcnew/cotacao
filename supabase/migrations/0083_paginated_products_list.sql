-- Lista de produtos filtrada e paginada no banco.
-- A tela do catálogo deixa de transferir todos os produtos e seus vínculos
-- apenas para exibir a página que cabe no viewport.

begin;

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
    order by filtered.name
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
          'comparisonUnitCode', comparison_unit.code
        ) order by product.name
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

revoke all on function public.rpc_list_products_page(
  uuid, integer, integer, text, text, uuid
) from public, anon;
grant execute on function public.rpc_list_products_page(
  uuid, integer, integer, text, text, uuid
) to authenticated;

commit;
