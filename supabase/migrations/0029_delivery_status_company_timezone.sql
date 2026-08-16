-- 0029_delivery_status_company_timezone.sql
--
-- APLICADA em 2026-08-16.
--
-- PROBLEMA
-- `v_order_delivery_status` compara `delivery_due_date` com `current_date`, e
-- o banco roda em UTC (verificado: current_setting('TimeZone') = 'UTC'). Para
-- quem trabalha no horario de Brasilia, o dia vira no banco tres horas antes
-- da meia-noite local: as 21h do dia do prazo, um pedido que ainda esta no
-- prazo passa a aparecer como atrasado.
--
-- E `entrega prevista para hoje` -- que a Central de Atencao precisa mostrar --
-- teria o mesmo problema, e ficaria pior se a data fosse calculada no
-- TypeScript: seria uma terceira nocao de "hoje", a do servidor de aplicacao.
--
-- SOLUCAO
-- A data de referencia passa a ser o hoje DA EMPRESA. `companies.timezone` ja
-- existe desde a 0002, com default 'America/Sao_Paulo', e nunca havia sido
-- usado para nada. O join e por company_id, que a view ja carrega.
--
-- Acrescenta tambem `is_due_today`, no fim da lista de colunas -- posicao
-- exigida por `create or replace view`. Com ela, "vence hoje" vira fato do
-- banco, do mesmo jeito que "esta atrasado", em vez de conta repetida na tela.
--
-- Empresa com fuso invalido nao derruba a view: `coalesce` cai em
-- 'America/Sao_Paulo', que e o default da coluna.
--
-- VERIFICADO apos aplicar: prazo de hoje marca is_due_today e nao marca
-- is_overdue; prazo de ontem inverte os dois; e as 23h UTC de um dia o "hoje"
-- da empresa em Sao Paulo ainda e o dia anterior.

begin;

create or replace view public.v_order_delivery_status
with (security_invoker = true)
as
with hoje as (
  select
    c.id as company_id,
    (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date as data
  from public.companies c
)
select
  o.company_id,
  o.id as order_id,
  o.order_number,
  o.supplier_id,
  o.status,
  r.id as current_revision_id,
  r.delivery_due_date,
  case
    when o.status in (
      'awaiting_confirmation','awaiting_delivery','partially_received'
    )
     and r.delivery_due_date is not null
     and r.delivery_due_date < h.data
    then true
    else false
  end as is_overdue,
  case
    when o.status in (
      'awaiting_confirmation','awaiting_delivery','partially_received'
    )
     and r.delivery_due_date is not null
     and r.delivery_due_date < h.data
    then h.data - r.delivery_due_date
    else 0
  end as overdue_days,
  case
    when o.status in (
      'awaiting_confirmation','awaiting_delivery','partially_received'
    )
     and r.delivery_due_date = h.data
    then true
    else false
  end as is_due_today
from public.orders o
join hoje h
  on h.company_id = o.company_id
left join public.order_revisions r
  on r.id = o.current_revision_id
 and r.company_id = o.company_id;

grant select on public.v_order_delivery_status to authenticated;

commit;
