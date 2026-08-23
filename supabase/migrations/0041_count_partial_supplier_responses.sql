-- 0041_count_partial_supplier_responses.sql
--
-- Na lista de Compras, "Responderam" significa que já existe ao menos uma
-- resposta aproveitável daquele fornecedor. Antes a view exigia
-- quotation_responses.status = 'completed', então uma resposta parcial (pelo
-- link ou lançada manualmente) continuava aparecendo como nenhuma resposta.

begin;

create or replace view public.v_purchase_round_progress
with (security_invoker = true)
as
  select
    pr.company_id,
    pr.id as purchase_round_id,
    pr.title,
    pr.status,
    count(distinct qi.id) filter (
      where qi.commercial_status <> 'cancelled'
    ) as total_items,
    count(distinct rs.id) as total_suppliers,
    count(distinct rs.id) filter (
      where qri.id is not null
    ) as suppliers_completed,
    count(distinct rs.id) - count(distinct rs.id) filter (
      where qri.id is not null
    ) as suppliers_pending,
    count(distinct qi.id) filter (
      where qi.commercial_status = 'confirmed'
    ) as items_confirmed,
    count(distinct o.id) as orders_created,
    pr.created_at,
    pr.notes
  from public.purchase_rounds pr
  left join public.quotation_items qi
    on qi.purchase_round_id = pr.id
   and qi.company_id = pr.company_id
  left join public.round_suppliers rs
    on rs.purchase_round_id = pr.id
   and rs.company_id = pr.company_id
   and rs.removed_at is null
  left join public.quotation_responses qr
    on qr.round_supplier_id = rs.id
   and qr.company_id = rs.company_id
  left join public.quotation_response_items qri
    on qri.quotation_response_id = qr.id
   and qri.company_id = qr.company_id
  left join public.orders o
    on o.purchase_round_id = pr.id
   and o.company_id = pr.company_id
  group by pr.company_id, pr.id, pr.title, pr.notes, pr.status, pr.created_at;

grant select on public.v_purchase_round_progress to authenticated;

create or replace function public.rpc_round_snapshot(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns table (
  itens_ativos integer,
  itens_com_resposta integer,
  itens_prontos integer,
  itens_alocados integer,
  grupos_abertos integer,
  fornecedores integer,
  fornecedores_enviados integer,
  fornecedores_responderam integer,
  itens_negociados integer,
  alocacoes_rascunho integer,
  pedidos_gerados integer
)
language sql
security invoker
set search_path = ''
as $$
  with itens as (
    select qi.id
    from public.quotation_items qi
    where qi.company_id = p_company_id
      and qi.purchase_round_id = p_purchase_round_id
      and qi.commercial_status <> 'cancelled'
  ),
  respondidos as (
    select distinct sqi.quotation_item_id as id
    from public.supplier_quotation_items sqi
    join public.quotation_response_items qri
      on qri.supplier_quotation_item_id = sqi.id
     and qri.company_id = sqi.company_id
    join public.round_suppliers rs
      on rs.id = sqi.round_supplier_id
     and rs.company_id = sqi.company_id
    where sqi.company_id = p_company_id
      and rs.purchase_round_id = p_purchase_round_id
      and qri.does_not_supply = false
      and qri.quoted_price is not null
  ),
  alocados as (
    select distinct pa.quotation_item_id as id
    from public.purchase_allocations pa
    where pa.company_id = p_company_id
      and pa.purchase_round_id = p_purchase_round_id
      and pa.status in ('draft', 'confirmed')
  )
  select
    (select count(*) from itens)::integer,
    (select count(*) from itens i join respondidos r on r.id = i.id)::integer,
    (select count(*) from itens i
       join respondidos r on r.id = i.id
       where not exists (select 1 from alocados a where a.id = i.id))::integer,
    (select count(*) from itens i join alocados a on a.id = i.id)::integer,
    (select count(*) from public.purchase_round_groups g
      where g.company_id = p_company_id
        and g.purchase_round_id = p_purchase_round_id
        and g.status = 'open')::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null)::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null
        and (
          rs.first_sent_at is not null
          or exists (
            select 1
            from public.quotation_responses qr
            join public.quotation_response_items qri
              on qri.quotation_response_id = qr.id
             and qri.company_id = qr.company_id
            where qr.company_id = rs.company_id
              and qr.round_supplier_id = rs.id
          )
        ))::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null
        and exists (
          select 1
          from public.quotation_responses qr
          join public.quotation_response_items qri
            on qri.quotation_response_id = qr.id
           and qri.company_id = qr.company_id
          where qr.company_id = rs.company_id
            and qr.round_supplier_id = rs.id
        ))::integer,
    (select count(distinct sqi.quotation_item_id)
       from public.negotiations n
       join public.quotation_response_items qri
         on qri.id = n.quotation_response_item_id
        and qri.company_id = n.company_id
       join public.supplier_quotation_items sqi
         on sqi.id = qri.supplier_quotation_item_id
        and sqi.company_id = qri.company_id
       join public.round_suppliers rs
         on rs.id = sqi.round_supplier_id
        and rs.company_id = sqi.company_id
      where n.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id)::integer,
    (select count(*) from public.purchase_allocations pa
      where pa.company_id = p_company_id
        and pa.purchase_round_id = p_purchase_round_id
        and pa.status = 'draft')::integer,
    (select count(*) from public.orders o
      where o.company_id = p_company_id
        and o.purchase_round_id = p_purchase_round_id
        and o.status <> 'cancelled')::integer;
$$;

revoke all on function public.rpc_round_snapshot(uuid,uuid) from public, anon;
grant execute on function public.rpc_round_snapshot(uuid,uuid) to authenticated;

commit;
