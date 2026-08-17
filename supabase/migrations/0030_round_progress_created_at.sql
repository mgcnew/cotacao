-- 0030_round_progress_created_at.sql
--
-- APLICADA em 2026-08-17.
--
-- PROBLEMA
-- `v_purchase_round_progress` (0015) nao expoe data nenhuma, e a lista de
-- Compras consultava a view sem `order by`. Como a view agrupa, o Postgres nao
-- promete ordem alguma: a mesma lista podia aparecer numa sequencia diferente
-- a cada visita, sem nada ter mudado.
--
-- Ordenar por titulo seria pior do que arbitrario -- seria arbitrario com cara
-- de intencao. O que o comprador espera de uma lista de rodadas e a mais
-- recente primeiro.
--
-- SOLUCAO
-- `created_at` entra no fim da lista de colunas, posicao exigida por
-- `create or replace view`. Puramente aditivo: nenhuma coluna existente muda
-- de nome, tipo ou posicao, e a view segue security_invoker.
--
-- `purchase_rounds.created_at` ja esta no `group by` implicitamente -- a view
-- agrupa por pr.id, que e chave primaria, e o Postgres aceita qualquer coluna
-- da mesma tabela nesse caso. Mesmo assim ela vai ao `group by` explicitamente,
-- porque depender do reconhecimento de dependencia funcional deixa a intencao
-- menos obvia para quem le.
--
-- VERIFICADO apos aplicar: 10 colunas, as 9 originais na mesma posicao, e a
-- lista ordenada por created_at desc devolve a rodada mais nova primeiro.

begin;

create or replace view public.v_purchase_round_progress
with (security_invoker = true)
as
select
  pr.company_id,
  pr.id as purchase_round_id,
  pr.title,
  pr.status,
  count(distinct qi.id) as total_items,
  count(distinct rs.id) as total_suppliers,
  count(distinct rs.id) filter (
    where qr.status = 'completed'
  ) as suppliers_completed,
  count(distinct rs.id) filter (
    where coalesce(qr.status, 'not_started') <> 'completed'
  ) as suppliers_pending,
  count(distinct qi.id) filter (
    where qi.commercial_status = 'confirmed'
  ) as items_confirmed,
  count(distinct o.id) as orders_created,
  pr.created_at
from public.purchase_rounds pr
left join public.quotation_items qi
  on qi.purchase_round_id = pr.id
 and qi.company_id = pr.company_id
left join public.round_suppliers rs
  on rs.purchase_round_id = pr.id
 and rs.company_id = pr.company_id
left join public.quotation_responses qr
  on qr.round_supplier_id = rs.id
 and qr.company_id = rs.company_id
left join public.orders o
  on o.purchase_round_id = pr.id
 and o.company_id = pr.company_id
group by pr.company_id, pr.id, pr.title, pr.status, pr.created_at;

grant select on public.v_purchase_round_progress to authenticated;

commit;
