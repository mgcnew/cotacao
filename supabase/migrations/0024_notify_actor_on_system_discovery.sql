-- 0024_notify_actor_on_system_discovery.sql
--
-- APLICADA em 2026-08-14.
--
-- PROBLEMA
-- A 0023 excluia o ator do evento de receber a notificacao -- "ninguem precisa
-- ser avisado do que acabou de fazer". Verificado em teste: a divergencia de
-- preco nao gerava notificacao nenhuma.
--
-- Causa: `commercial_divergence.detected` tem como ator o proprio comprador
-- que lancou o recebimento, e ele costuma ser tambem quem tem
-- `commercial_divergence.manage`. A exclusao zerava a lista.
--
-- IMPACTO
-- Justamente a notificacao mais util se perdia. O comprador digita o preco que
-- veio na nota; ele nao necessariamente REPARA que aquele numero difere do
-- combinado. Quem descobre isso e o sistema -- e ficava calado.
--
-- SOLUCAO
-- A exclusao do ator passa a ser por evento, nao geral. Ela faz sentido para
-- ato deliberado ("enviei o pedido, eu sei"), e nao para descoberta do
-- sistema, que e exatamente o que a pessoa nao percebeu sozinha.
--
-- Dos quatro eventos, tres tem o fornecedor como ator, entao a exclusao nunca
-- chegava a valer neles. Fica declarada mesmo assim, para quando novos eventos
-- com ator interno forem acrescentados.
--
-- VERIFICADO: ciclo completo gera 3 notificacoes a partir de 17 eventos de
-- dominio, e a de divergencia de preco passa a chegar ao comprador.

create or replace function private.fanout_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission text;
  v_title text;
  v_message text;
  v_priority text := 'normal';
  v_action_url text;
  v_order_id uuid;
  v_round_id uuid;
  -- Descoberta do sistema avisa todo mundo, inclusive quem disparou sem saber.
  v_notify_actor boolean := false;
begin
  case new.event_type

    when 'quotation.response_submitted' then
      v_permission := 'purchase_round.view';
      v_title := 'Fornecedor respondeu a cotacao';
      v_message := coalesce(new.payload ->> 'answered_items', '?') || ' de ' ||
                   coalesce(new.payload ->> 'total_items', '?') || ' itens respondidos';
      select rs.purchase_round_id into v_round_id
      from public.round_suppliers rs
      where rs.id = new.aggregate_id and rs.company_id = new.company_id;
      v_action_url := '/compras/' || coalesce(v_round_id::text, '');

    when 'order.confirmed' then
      v_permission := 'order.view';
      v_title := 'Pedido confirmado pelo fornecedor';
      v_message := 'O pedido esta liberado para recebimento.';
      v_action_url := '/pedidos/' || new.aggregate_id::text;

    when 'order.divergence_created' then
      v_permission := 'order.revise';
      v_priority := 'high';
      v_title := 'Fornecedor apontou divergencia no pedido';
      v_message := coalesce(new.payload ->> 'count', '1') ||
                   ' ponto(s) a resolver antes da entrega.';
      v_action_url := '/pedidos/' || new.aggregate_id::text;

    when 'commercial_divergence.detected' then
      v_permission := 'commercial_divergence.manage';
      v_priority := 'high';
      v_notify_actor := true;
      v_title := 'Preco da nota diferente do combinado';
      v_message := 'Combinado ' || coalesce(new.payload ->> 'agreed_price', '?') ||
                   ', praticado ' || coalesce(new.payload ->> 'practiced_price', '?') || '.';
      select r.order_id into v_order_id
      from public.receipt_items ri
      join public.receipts r
        on r.id = ri.receipt_id and r.company_id = ri.company_id
      where ri.id = new.aggregate_id and ri.company_id = new.company_id;
      v_action_url := '/pedidos/' || coalesce(v_order_id::text, '');

    else
      -- Os outros 12 eventos seguem so no historico de dominio.
      return new;
  end case;

  insert into public.notifications (
    company_id, user_id, type, title, message, priority,
    resource_type, resource_id, action_url, metadata
  )
  select
    new.company_id, m.user_id, new.event_type, v_title, v_message, v_priority,
    new.aggregate_type, new.aggregate_id, v_action_url, new.payload
  from private.members_with_permission(new.company_id, v_permission) m
  where v_notify_actor
     or new.actor_user_id is null
     or m.user_id <> new.actor_user_id;

  return new;
end;
$$;


revoke all on function private.fanout_notification() from public, anon, authenticated;
