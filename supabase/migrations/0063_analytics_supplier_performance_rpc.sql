-- 0063_analytics_supplier_performance_rpc.sql
--
-- Agrega o desempenho no banco com uma unica passagem. Consultar diretamente
-- v_quotation_history como usuario autenticado reavalia RLS em todas as tabelas
-- da view e pode atingir o statement_timeout mesmo com poucos resultados.

begin;

create or replace function public.rpc_analytics_supplier_performance(
  p_company_id uuid,
  p_from date default null,
  p_to date default null,
  p_product_ids uuid[] default null,
  p_supplier_id uuid default null,
  p_outcome text default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  opportunities bigint,
  responses bigint,
  wins bigint,
  losses bigint,
  no_responses bigint,
  unavailable bigint,
  purchase_orders bigint,
  last_round_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_company_id, 'analytics.view') then
    raise exception 'Permissão insuficiente';
  end if;

  if p_outcome is not null and p_outcome not in (
    'won', 'lost', 'no_response', 'unavailable',
    'closed_without_purchase', 'in_progress'
  ) then
    raise exception 'Resultado de cotação inválido';
  end if;

  return query
  select
    h.supplier_id,
    max(h.supplier_name) as supplier_name,
    count(*) as opportunities,
    count(h.quotation_response_item_id) as responses,
    count(*) filter (where h.outcome = 'won') as wins,
    count(*) filter (where h.outcome = 'lost') as losses,
    count(*) filter (where h.outcome = 'no_response') as no_responses,
    count(*) filter (where h.outcome = 'unavailable') as unavailable,
    count(distinct h.order_id) as purchase_orders,
    max(h.round_created_at) as last_round_at
  from public.v_quotation_history h
  where h.company_id = p_company_id
    and (p_from is null or h.round_created_at >= p_from::timestamptz)
    and (p_to is null or h.round_created_at < (p_to + 1)::timestamptz)
    and (p_product_ids is null or h.product_id = any(p_product_ids))
    and (p_supplier_id is null or h.supplier_id = p_supplier_id)
    and (p_outcome is null or h.outcome = p_outcome)
  group by h.supplier_id
  order by
    count(*) filter (where h.outcome = 'won') desc,
    count(*) desc,
    max(h.supplier_name);
end;
$$;

revoke all on function public.rpc_analytics_supplier_performance(
  uuid, date, date, uuid[], uuid, text
) from public, anon;

grant execute on function public.rpc_analytics_supplier_performance(
  uuid, date, date, uuid[], uuid, text
) to authenticated;

commit;
