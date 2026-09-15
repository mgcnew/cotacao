-- Desempenho do fornecedor na entrega, e não só na disputa.
--
-- `rpc_analytics_supplier_performance` mede a fase de cotação: convites,
-- respostas e itens ganhos. A coluna "Pedidos" daquela agregação saía da mesma
-- base e contava `order_id` distinto de qualquer pedido não cancelado — pedido
-- em rascunho, aguardando confirmação e aguardando entrega entravam na conta
-- como se fossem compra concluída, e pedido direto, que nunca passou por
-- cotação, não entrava de jeito nenhum.
--
-- Esta função responde a outra pergunta, com outra base: dos pedidos feitos a
-- este fornecedor, quantos ele de fato fechou, quanto veio em mercadoria e
-- quantas divergências a entrega abriu. Pedido concluído é o recebido por
-- inteiro (`status = 'received'`), cujo `completed_at` é o instante do
-- recebimento que o fechou — por isso o período recorta pela entrega, não pela
-- rodada de cotação.

begin;

create or replace function public.rpc_analytics_supplier_delivery(
  p_company_id uuid,
  p_from date default null,
  p_to date default null,
  p_product_ids uuid[] default null,
  p_supplier_id uuid default null
)
returns table (
  supplier_id uuid,
  completed_orders bigint,
  received_total numeric,
  divergences bigint,
  last_completed_at timestamptz
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

  return query
  with completed as (
    select
      o.supplier_id,
      count(*) as completed_orders,
      max(o.completed_at) as last_completed_at
    from public.orders o
    where o.company_id = p_company_id
      and o.status = 'received'
      and o.completed_at is not null
      and (p_from is null or o.completed_at >= p_from::timestamptz)
      and (p_to is null or o.completed_at < (p_to + 1)::timestamptz)
      and (p_supplier_id is null or o.supplier_id = p_supplier_id)
      -- Com filtro de produto, o pedido só conta se tiver aquele produto:
      -- é o mesmo recorte que as colunas de cotação já aplicam.
      and (p_product_ids is null or exists (
        select 1
        from public.order_revision_items ori
        where ori.company_id = o.company_id
          and ori.order_revision_id = o.current_revision_id
          and ori.product_id = any(p_product_ids)
      ))
    group by o.supplier_id
  ),
  received as (
    select
      o.supplier_id,
      sum(
        ri.practiced_price * ri.pricing_quantity_received
      ) as received_total
    from public.receipt_items ri
    join public.receipts r
      on r.company_id = ri.company_id
     and r.id = ri.receipt_id
     and r.status = 'posted'
    join public.orders o
      on o.company_id = r.company_id
     and o.id = r.order_id
    join public.order_revision_items ori
      on ori.company_id = ri.company_id
     and ori.id = ri.order_revision_item_id
    where ri.company_id = p_company_id
      and (p_from is null or r.received_at >= p_from::timestamptz)
      and (p_to is null or r.received_at < (p_to + 1)::timestamptz)
      and (p_supplier_id is null or o.supplier_id = p_supplier_id)
      and (p_product_ids is null or ori.product_id = any(p_product_ids))
    group by o.supplier_id
  ),
  -- Contagem em CTE próprio: um mesmo item conferido pode abrir divergência de
  -- preço e de quantidade, e juntá-las ao valor recebido somaria a mercadoria
  -- duas vezes.
  divergent as (
    select
      o.supplier_id,
      count(*) as divergences
    from public.commercial_divergences divergence
    join public.receipt_items ri
      on ri.company_id = divergence.company_id
     and ri.id = divergence.receipt_item_id
    join public.receipts r
      on r.company_id = ri.company_id
     and r.id = ri.receipt_id
     and r.status = 'posted'
    join public.orders o
      on o.company_id = r.company_id
     and o.id = r.order_id
    join public.order_revision_items ori
      on ori.company_id = divergence.company_id
     and ori.id = divergence.order_revision_item_id
    where divergence.company_id = p_company_id
      and (p_from is null or r.received_at >= p_from::timestamptz)
      and (p_to is null or r.received_at < (p_to + 1)::timestamptz)
      and (p_supplier_id is null or o.supplier_id = p_supplier_id)
      and (p_product_ids is null or ori.product_id = any(p_product_ids))
    group by o.supplier_id
  ),
  -- Há fornecedor com entrega no período sem nenhum pedido fechado, e a
  -- recíproca aparece quando o filtro de produto deixa a entrega de fora.
  participants as (
    select completed.supplier_id from completed
    union
    select received.supplier_id from received
  )
  select
    participants.supplier_id,
    coalesce(completed.completed_orders, 0),
    coalesce(received.received_total, 0),
    coalesce(divergent.divergences, 0),
    completed.last_completed_at
  from participants
  left join completed on completed.supplier_id = participants.supplier_id
  left join received on received.supplier_id = participants.supplier_id
  left join divergent on divergent.supplier_id = participants.supplier_id;
end;
$$;

revoke all on function public.rpc_analytics_supplier_delivery(
  uuid, date, date, uuid[], uuid
) from public, anon;

grant execute on function public.rpc_analytics_supplier_delivery(
  uuid, date, date, uuid[], uuid
) to authenticated;

commit;
