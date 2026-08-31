-- 0085_quotation_history_summary_definer.sql
--
-- `rpc_quotation_history_summary` estourava o statement_timeout no histórico do
-- fornecedor: "canceling statement due to statement timeout".
--
-- POR QUE
--
-- A função é `security invoker` e lê `public.v_quotation_history`, que também é
-- `security_invoker = true`. A view tem três CTEs — allocation_summary,
-- order_summary e receipt_summary — que agregam as tabelas INTEIRAS, sem filtro
-- de empresa: o recorte por fornecedor só existe na consulta de fora e não é
-- empurrado para dentro delas.
--
-- Sobre cada linha dessas varreduras a RLS aplica
-- `(select private.is_company_member(company_id))`. O `(select ...)` só é
-- avaliado uma vez quando o argumento é constante; aqui o argumento é uma
-- COLUNA, então o subplano é correlacionado e roda por linha. São 49 políticas
-- escritas nessa forma, e as tabelas envolvidas são as maiores do banco.
--
-- Com a chave de serviço, que não passa por RLS, a mesma função responde em
-- ~200ms para os 34 fornecedores. Autenticado, estoura.
--
-- O QUE MUDA
--
-- A função passa a `security definer` e checa a participação UMA vez, no topo,
-- em vez de deixar a RLS reavaliar linha a linha lá dentro. É exatamente o que
-- as funções de `private` já fazem neste banco.
--
-- O isolamento entre empresas continua garantido: sem `is_company_member` o
-- retorno é vazio, e `p_company_id` segue obrigatório no corpo da consulta.
-- Nenhuma linha de outra empresa se torna alcançável — o que se perde é apenas
-- a reavaliação redundante do mesmo fato.

begin;

create or replace function public.rpc_quotation_history_summary(
  p_company_id uuid,
  p_product_id uuid default null,
  p_supplier_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  rounds bigint,
  opportunities bigint,
  responses bigint,
  wins bigint,
  losses bigint,
  no_responses bigint,
  orders bigint,
  min_price numeric,
  max_price numeric,
  average_price numeric,
  last_price numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select h.*
    from public.v_quotation_history h
    where private.is_company_member(p_company_id)
      and h.company_id = p_company_id
      and (p_product_id is null or h.product_id = p_product_id)
      and (p_supplier_id is null or h.supplier_id = p_supplier_id)
      and (p_from is null or h.round_created_at >= p_from::timestamptz)
      and (p_to is null or h.round_created_at < (p_to + 1)::timestamptz)
  )
  select
    count(distinct purchase_round_id),
    count(*),
    count(quotation_response_item_id),
    count(*) filter (where outcome = 'won'),
    count(*) filter (where outcome = 'lost'),
    count(*) filter (where outcome = 'no_response'),
    count(distinct order_id),
    min(current_price),
    max(current_price),
    avg(current_price),
    (array_agg(
      current_price
      order by coalesce(submitted_at, round_created_at) desc
    ) filter (where current_price is not null))[1]
  from filtered;
$$;

revoke all on function public.rpc_quotation_history_summary(
  uuid, uuid, uuid, date, date
) from public, anon;
grant execute on function public.rpc_quotation_history_summary(
  uuid, uuid, uuid, date, date
) to authenticated;

commit;
