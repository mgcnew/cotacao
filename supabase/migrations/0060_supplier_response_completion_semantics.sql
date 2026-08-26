-- 0060_supplier_response_completion_semantics.sql
--
-- Um fornecedor pode dar retorno sem concluir o escopo: por exemplo, informar
-- preço para 2 de 5 produtos. `suppliers_completed` passou historicamente a
-- significar "teve algum retorno" na 0041 e é consumido pelo dashboard com
-- esse sentido. Mantemos essa coluna por compatibilidade, acrescentamos a
-- conclusão real e fazemos `suppliers_pending` representar quem ainda não
-- terminou todos os itens enquanto a rodada está aberta.

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
    -- Compatibilidade: fornecedor que respondeu ao menos um item.
    count(distinct rs.id) filter (
      where qri.id is not null
    ) as suppliers_completed,
    -- Trabalho ainda aberto: sem resposta ou resposta parcial.
    count(distinct rs.id) filter (
      where coalesce(qr.status, 'not_started') <> 'completed'
    ) as suppliers_pending,
    count(distinct qi.id) filter (
      where qi.commercial_status = 'confirmed'
    ) as items_confirmed,
    count(distinct o.id) as orders_created,
    pr.created_at,
    pr.notes,
    -- Semântica nova e explícita: respondeu todos os itens atribuídos,
    -- incluindo os marcados conscientemente como "não fornece".
    count(distinct rs.id) filter (
      where qr.status = 'completed'
    ) as suppliers_finalized
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

commit;
