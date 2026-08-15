-- 0023_notification_producer.sql
--
-- APLICADA em 2026-08-14. Ver tambem 0024, que corrige a exclusao do ator.
--
-- PROBLEMA
-- A tabela `notifications` existe e esta bem desenhada, mas nada escreve nela:
-- nenhum insert nas migrations 0001-0022, zero linhas em producao, zero
-- gatilhos em `domain_events`. E `authenticated` tem apenas SELECT e UPDATE --
-- decisao deliberada: o usuario le as proprias e marca como lida, nada alem.
-- Faltava a outra metade, a que cria.
--
-- Enquanto isso, as RPCs ja emitem 16 tipos de evento de dominio. A materia
-- prima existia sem consumidor.
--
-- SOLUCAO
-- Gatilho em `domain_events` que espalha o evento para as pessoas certas.
-- Nasce na mesma transacao do fato, entao nenhum evento se perde, e o app
-- continua sem INSERT em notifications -- a seguranca atual fica intacta.
--
-- Destinatario e por PERMISSAO, nao por papel nem por autoria: quem pode agir
-- sobre aquilo e avisado. Acompanha mudanca de papel sozinho, e nao some
-- quando a pessoa que criou a rodada esta de folga.
--
-- Quatro eventos, dos 16 -- os que o documento mestre cita em 17.2. Notificar
-- tudo viraria ruido, e ruido ninguem le.
--   quotation.response_submitted   -> purchase_round.view
--   order.confirmed                -> order.view
--   order.divergence_created       -> order.revise
--   commercial_divergence.detected -> commercial_divergence.manage
--
-- "Atraso", o quarto caso citado pelo documento, NAO entra aqui: nao e evento,
-- e condicao de tempo (v_order_delivery_status.is_overdue). Exige rotina
-- agendada, que e decisao de infraestrutura separada.

-- Quem, nesta empresa, tem a permissao. Mesma regra de private.has_permission
-- (deny vence allow, allow vence papel), mas devolvendo o conjunto em vez de
-- responder sobre o usuario corrente.
create or replace function private.members_with_permission(
  target_company_id uuid,
  permission_key text
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with perm as (
    select p.id from public.permissions p where p.key = permission_key limit 1
  ),
  membros as (
    select cm.id as member_id, cm.user_id, cm.role_id
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.status = 'active'
  )
  select m.user_id
  from membros m
  cross join perm
  left join public.member_permission_overrides mpo
    on mpo.company_member_id = m.member_id
   and mpo.permission_id = perm.id
  where coalesce(
    case mpo.effect
      when 'deny' then false
      when 'allow' then true
      else null
    end,
    exists (
      select 1
      from public.role_permissions rp
      where rp.role_id = m.role_id
        and rp.permission_id = perm.id
    )
  );
$$;

revoke all on function private.members_with_permission(uuid, text)
  from public, anon, authenticated;

comment on function private.members_with_permission(uuid, text)
is 'Usuarios ativos da empresa que possuem a permissao, aplicando override deny/allow sobre o papel.';

-- NOTA: o corpo abaixo e o que foi aplicado nesta migration. A 0024 o
-- substitui, trocando a exclusao geral do ator por exclusao caso a caso.
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
  where new.actor_user_id is null or m.user_id <> new.actor_user_id;

  return new;
end;
$$;

revoke all on function private.fanout_notification() from public, anon, authenticated;

create trigger domain_events_fanout_notification
after insert on public.domain_events
for each row execute function private.fanout_notification();
