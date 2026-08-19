-- Os indicadores da Central da Rodada, numa ida só.
--
-- O documento mestre, 6.3, diz que a Central deve concentrar produtos, grupos,
-- fornecedores, envios, respostas, negociações, melhores preços, alocações,
-- pedidos gerados e pendências — com indicadores de quantos são cada coisa.
--
-- Montar isso no cliente custaria cinco leituras: itens, respostas,
-- negociações, alocações e pedidos. Do Brasil para São Paulo cada ida é barata
-- hoje, mas cinco continuam sendo cinco — e é a mesma razão da 0033, que juntou
-- as dezoito do painel em uma.
--
-- `security invoker`: as contagens passam pelo RLS de quem pergunta, como as
-- consultas que elas substituem.
--
-- Item "pronto para decidir" é o que tem ao menos uma resposta com preço e
-- nenhuma alocação viva. É essa a fila de trabalho de quem vai fechar a compra:
-- alguém já deu preço e ninguém escolheu ainda.

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
  -- Uma resposta com preço, de qualquer fornecedor, por item.
  respondidos as (
    select distinct sqi.quotation_item_id as id
    from public.supplier_quotation_items sqi
    join public.quotation_response_items qri
      on qri.supplier_quotation_item_id = sqi.id
     and qri.company_id = sqi.company_id
    join public.round_suppliers rs
      on rs.id = sqi.round_supplier_id and rs.company_id = sqi.company_id
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
        and rs.purchase_round_id = p_purchase_round_id)::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.first_sent_at is not null)::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.completed_at is not null)::integer,
    -- Itens distintos que passaram por negociação, e não o total de
    -- negociações: dois descontos no mesmo item continuam sendo um item.
    (select count(distinct sqi.quotation_item_id)
       from public.negotiations n
       join public.quotation_response_items qri
         on qri.id = n.quotation_response_item_id and qri.company_id = n.company_id
       join public.supplier_quotation_items sqi
         on sqi.id = qri.supplier_quotation_item_id and sqi.company_id = qri.company_id
       join public.round_suppliers rs
         on rs.id = sqi.round_supplier_id and rs.company_id = sqi.company_id
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

comment on function public.rpc_round_snapshot is
  'Indicadores da Central da Rodada — documento mestre, 6.3 — em uma leitura.';

revoke all on function public.rpc_round_snapshot(uuid,uuid) from public, anon;
grant execute on function public.rpc_round_snapshot(uuid,uuid) to authenticated;
