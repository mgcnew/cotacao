-- 0077_dashboard_actionable_attention.sql
--
-- A Central de Atencao deve mostrar condicoes que ainda exigem uma acao, nao
-- eventos historicos. A versao anterior contava divergencias pendentes mesmo
-- quando o pedido ja estava cancelado e cada log de envio `failed`, ainda que
-- um reenvio posterior tivesse funcionado ou o fornecedor tivesse aberto o
-- link/respondido.

begin;

-- Corrige registros antigos que possam ter sido cancelados antes de a rotina
-- de cancelamento passar a encerrar as divergencias na mesma transacao.
update public.order_divergences d
set status = 'cancelled',
    resolved_at = coalesce(d.resolved_at, now()),
    updated_at = now()
from public.orders o
where o.id = d.order_id
  and o.company_id = d.company_id
  and o.status = 'cancelled'
  and d.status = 'pending';

create or replace function public.rpc_dashboard_snapshot(
  p_company_id uuid,
  p_dias_falha int default 7,
  p_status_em_andamento text[] default array[]::text[]
)
returns table (
  pedidos_atrasados int,
  atraso_pior_dias int,
  atraso_order_id uuid,
  entregas_hoje int,
  entrega_hoje_order_id uuid,
  pedidos_rascunho int,
  rascunho_order_id uuid,
  revisoes_pendentes int,
  revisao_order_id uuid,
  falhas_envio int,
  divergencias_comerciais int,
  divergencia_comercial_order_id uuid,
  divergencias_fornecedor int,
  divergencia_fornecedor_order_id uuid,
  pedidos_em_aberto int,
  itens_sem_alocacao int,
  produtos_ativos int,
  fornecedores_ativos int,
  rodadas_total int,
  rodadas jsonb
)
language sql
stable
set search_path = ''
as $$
  with rodadas_ativas as (
    select
      p.purchase_round_id,
      p.title,
      coalesce(p.total_suppliers, 0) as total_suppliers,
      coalesce(p.suppliers_pending, 0) as suppliers_pending,
      coalesce(p.suppliers_completed, 0) as suppliers_completed,
      coalesce(p.orders_created, 0) as orders_created
    from public.v_purchase_round_progress p
    where p.company_id = p_company_id
      and p.status = 'active'
      and p.purchase_round_id is not null
  ),
  atrasados as (
    select d.order_id, coalesce(d.overdue_days, 0) as overdue_days
    from public.v_order_delivery_status d
    where d.company_id = p_company_id
      and d.is_overdue
  ),
  hoje as (
    select d.order_id
    from public.v_order_delivery_status d
    where d.company_id = p_company_id
      and d.is_due_today
  ),
  rascunhos as (
    select o.id
    from public.orders o
    where o.company_id = p_company_id
      and o.status = 'draft'
  ),
  revisoes as (
    select r.order_id
    from public.order_revisions r
    join public.orders o
      on o.id = r.order_id
     and o.company_id = r.company_id
    where r.company_id = p_company_id
      and r.status = 'draft'
      and r.revision_number > 1
      and o.status <> 'cancelled'
  ),
  div_comerciais as (
    select c.order_id
    from public.commercial_divergences c
    join public.orders o
      on o.id = c.order_id
     and o.company_id = c.company_id
    where c.company_id = p_company_id
      and c.status = 'pending'
      and o.status <> 'cancelled'
  ),
  div_fornecedor as (
    select v.order_id
    from public.order_divergences v
    join public.orders o
      on o.id = v.order_id
     and o.company_id = v.company_id
    where v.company_id = p_company_id
      and v.status = 'pending'
      and o.status <> 'cancelled'
  ),
  falhas_acionaveis as (
    -- Cotacao: deixa de ser pendencia quando houve reenvio com sucesso, o
    -- fornecedor abriu o link, respondeu, foi removido ou a rodada encerrou.
    select distinct 'round:' || f.round_supplier_id::text as alvo
    from public.communication_logs f
    join public.round_suppliers rs
      on rs.id = f.round_supplier_id
     and rs.company_id = f.company_id
    join public.purchase_rounds pr
      on pr.id = rs.purchase_round_id
     and pr.company_id = rs.company_id
    where f.company_id = p_company_id
      and f.status = 'failed'
      and f.round_supplier_id is not null
      and f.created_at >= now() - make_interval(days => p_dias_falha)
      and pr.status = 'active'
      and rs.removed_at is null
      and rs.first_accessed_at is null
      and rs.completed_at is null
      and not exists (
        select 1
        from public.communication_logs posterior
        where posterior.company_id = f.company_id
          and posterior.round_supplier_id = f.round_supplier_id
          and posterior.created_at > f.created_at
          and posterior.status in ('sent', 'delivered')
      )

    union

    -- Pedido: so pede reenvio enquanto ainda e rascunho/aguarda confirmacao.
    -- Confirmacao ou divergencia do fornecedor prova que a mensagem chegou.
    select distinct 'order:' || f.order_revision_id::text as alvo
    from public.communication_logs f
    join public.order_revisions r
      on r.id = f.order_revision_id
     and r.company_id = f.company_id
    join public.orders o
      on o.id = r.order_id
     and o.company_id = r.company_id
    where f.company_id = p_company_id
      and f.status = 'failed'
      and f.order_revision_id is not null
      and f.created_at >= now() - make_interval(days => p_dias_falha)
      and o.status in ('draft', 'awaiting_confirmation')
      and r.status in ('draft', 'sent')
      and r.confirmed_at is null
      and not exists (
        select 1
        from public.communication_logs posterior
        where posterior.company_id = f.company_id
          and posterior.order_revision_id = f.order_revision_id
          and posterior.created_at > f.created_at
          and posterior.status in ('sent', 'delivered')
      )
  )
  select
    (select count(*)::int from atrasados),
    (select coalesce(max(overdue_days), 0)::int from atrasados),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from atrasados),

    (select count(*)::int from hoje),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from hoje),

    (select count(*)::int from rascunhos),
    (select case when count(*) = 1 then (array_agg(id))[1] end from rascunhos),

    (select count(distinct order_id)::int from revisoes),
    (select case when count(distinct order_id) = 1 then (array_agg(distinct order_id))[1] end from revisoes),

    (select count(*)::int from falhas_acionaveis),

    (select count(*)::int from div_comerciais),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from div_comerciais),

    (select count(*)::int from div_fornecedor),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from div_fornecedor),

    (select count(*)::int
       from public.orders o
      where o.company_id = p_company_id
        and o.status = any(p_status_em_andamento)),

    (select count(*)::int
       from public.quotation_items q
      where q.company_id = p_company_id
        and q.commercial_status = 'open'
        and q.purchase_round_id in (
          select purchase_round_id from rodadas_ativas where suppliers_completed > 0
        )),

    (select count(*)::int
       from public.products pr
      where pr.company_id = p_company_id
        and pr.is_active),

    (select count(*)::int
       from public.suppliers s
      where s.company_id = p_company_id
        and s.status = 'active'),

    (select count(*)::int
       from public.purchase_rounds r
      where r.company_id = p_company_id),

    (select coalesce(
       jsonb_agg(jsonb_build_object(
         'roundId', purchase_round_id,
         'title', coalesce(title, 'Rodada'),
         'totalSuppliers', total_suppliers,
         'suppliersPending', suppliers_pending,
         'suppliersCompleted', suppliers_completed,
         'ordersCreated', orders_created
       ) order by title),
       '[]'::jsonb)
     from rodadas_ativas);
$$;

revoke all on function public.rpc_dashboard_snapshot(uuid, int, text[]) from public, anon;
grant execute on function public.rpc_dashboard_snapshot(uuid, int, text[]) to authenticated;

comment on function public.rpc_dashboard_snapshot(uuid, int, text[])
is 'Retrato do dashboard: somente pendencias atuais e acionaveis; ignora cancelados e comunicacoes ja superadas.';

commit;
