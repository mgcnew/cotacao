-- 0033_dashboard_snapshot.sql
--
-- PROBLEMA
-- O dashboard fazia 18 idas ao banco para desenhar uma tela. Instrumentando o
-- fetch do client em producao, cada ida custa ~230 ms de rede -- o Postgres
-- responde em microssegundos, o caminho e que e longo. Quatorze dessas idas
-- eram contagens minusculas: "quantos pedidos atrasados", "quantos rascunhos",
-- "quantas divergencias". Uma pergunta de contagem por viagem.
--
-- Pior: disparadas em paralelo, elas nao custam 230 ms cada e pronto. Em rajada
-- o undici abre conexao nova para as que nao cabem nas ja abertas, e cada
-- conexao nova paga TCP + TLS: as mesmas consultas que respondem em 230 ms
-- isoladas apareciam com 600-780 ms dentro da rajada.
--
-- SOLUCAO
-- Uma funcao devolve o retrato inteiro numa linha so. Dezoito idas viram cinco.
-- E o mesmo movimento da 0032, pelo mesmo motivo: o custo nao esta na conta,
-- esta na viagem.
--
-- SEGURANCA
-- `security invoker`: le pelas policies de quem chama, exatamente como o app
-- fazia com as consultas soltas. O filtro por empresa e explicito, e a RLS de
-- cada tabela continua sendo a ultima palavra -- quem nao e membro daquela
-- empresa recebe zeros, nao dados alheios.
--
-- As permissoes NAO sao decididas aqui. A tela ja escolhe o que mostrar com
-- base nelas, e a RLS impede o resto; replicar a regra de permissao dentro
-- desta funcao criaria uma terceira copia dela.
--
-- PARAMETROS
-- `p_dias_falha` e `p_status_em_andamento` vem do app de proposito: sao
-- constantes de dominio que ja existem no TypeScript, e grava-las aqui faria
-- uma segunda definicao que envelhece sozinha.
--
-- VERIFICADO apos aplicar: os numeros batem, um a um, com os que as consultas
-- soltas devolviam para a mesma empresa.

begin;

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
    -- Revisao 1 nasce junto com o pedido; rascunho dela e o pedido ainda nao
    -- enviado, que ja tem item proprio. So da 2 em diante e "revisao parada".
    select r.order_id
    from public.order_revisions r
    where r.company_id = p_company_id
      and r.status = 'draft'
      and r.revision_number > 1
  ),
  div_comerciais as (
    select c.order_id
    from public.commercial_divergences c
    where c.company_id = p_company_id
      and c.status = 'pending'
  ),
  div_fornecedor as (
    select v.order_id
    from public.order_divergences v
    where v.company_id = p_company_id
      and v.status = 'pending'
  )
  select
    (select count(*)::int from atrasados),
    (select coalesce(max(overdue_days), 0)::int from atrasados),
    -- O id so interessa quando ha um caso: com dois ou mais, o link vai para a
    -- lista filtrada, e apontar para um deles seria escolher por quem le.
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from atrasados),

    (select count(*)::int from hoje),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from hoje),

    (select count(*)::int from rascunhos),
    (select case when count(*) = 1 then (array_agg(id))[1] end from rascunhos),

    (select count(distinct order_id)::int from revisoes),
    (select case when count(distinct order_id) = 1 then (array_agg(distinct order_id))[1] end from revisoes),

    (select count(*)::int
       from public.communication_logs l
      where l.company_id = p_company_id
        and l.status = 'failed'
        and l.created_at >= now() - make_interval(days => p_dias_falha)),

    (select count(*)::int from div_comerciais),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from div_comerciais),

    (select count(*)::int from div_fornecedor),
    (select case when count(*) = 1 then (array_agg(order_id))[1] end from div_fornecedor),

    (select count(*)::int
       from public.orders o
      where o.company_id = p_company_id
        and o.status = any(p_status_em_andamento)),

    -- Item sem decisao de compra so e pendencia onde ja existe resposta para
    -- comparar: rodada recem-enviada tem tudo em aberto, e isso e o normal.
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
is 'Retrato do dashboard em uma ida: pendencias, situacao e primeiros passos. Invoker: le pelas policies de quem chama.';

commit;
