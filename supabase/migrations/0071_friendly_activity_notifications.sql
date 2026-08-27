-- 0071_friendly_activity_notifications.sql
-- Notificações operacionais com linguagem natural e identificação do
-- fornecedor. Mantém o evento técnico apenas como tipo interno.

begin;

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
  v_order_number bigint;
  v_supplier_name text;
  v_answered integer;
  v_total integer;
  v_count integer;
  v_notify_actor boolean := false;
begin
  case new.event_type
    when 'quotation.response_submitted' then
      v_permission := 'purchase_round.view';
      select rs.purchase_round_id, s.name
      into v_round_id, v_supplier_name
      from public.round_suppliers rs
      join public.suppliers s
        on s.company_id = rs.company_id
       and s.id = rs.supplier_id
      where rs.id = new.aggregate_id
        and rs.company_id = new.company_id;

      v_answered := nullif(new.payload ->> 'answered_items', '')::integer;
      v_total := nullif(new.payload ->> 'total_items', '')::integer;
      v_title := coalesce(v_supplier_name, 'Um fornecedor') ||
        ' respondeu à cotação';
      v_message := case
        when v_answered is null or v_total is null
          then 'A resposta já está disponível para conferência.'
        when v_total = 1
          then v_answered || ' de 1 produto foi respondido.'
        else v_answered || ' de ' || v_total || ' produtos foram respondidos.'
      end;
      v_action_url := '/compras/' || coalesce(v_round_id::text, '');

    when 'order.confirmed' then
      v_permission := 'receipt.view';
      select s.name, o.order_number
      into v_supplier_name, v_order_number
      from public.orders o
      join public.suppliers s
        on s.company_id = o.company_id
       and s.id = o.supplier_id
      where o.id = new.aggregate_id
        and o.company_id = new.company_id;
      v_title := coalesce(v_supplier_name, 'O fornecedor') ||
        ' confirmou o pedido' ||
        case when v_order_number is null then '' else ' #' || v_order_number end;
      v_message := 'O pedido está confirmado e já pode seguir para o recebimento.';
      v_action_url := '/recebimentos';

    when 'receipt.arrived' then
      v_permission := 'receipt.post';
      select o.order_number into v_order_number
      from public.orders o
      where o.id = (new.payload ->> 'order_id')::uuid
        and o.company_id = new.company_id;
      v_title := 'Mercadoria aguardando conferência';
      v_message := 'A chegada do pedido #' ||
        coalesce(v_order_number::text, '?') || ' foi registrada.';
      v_action_url := '/recebimentos/' || new.aggregate_id::text;

    when 'order.divergence_created' then
      v_permission := 'order.revise';
      v_priority := 'high';
      select s.name, o.order_number
      into v_supplier_name, v_order_number
      from public.orders o
      join public.suppliers s
        on s.company_id = o.company_id
       and s.id = o.supplier_id
      where o.id = new.aggregate_id
        and o.company_id = new.company_id;
      v_count := coalesce(nullif(new.payload ->> 'count', '')::integer, 1);
      v_title := coalesce(v_supplier_name, 'O fornecedor') ||
        ' informou uma divergência no pedido' ||
        case when v_order_number is null then '' else ' #' || v_order_number end;
      v_message := v_count ||
        case when v_count = 1
          then ' ponto precisa ser conferido antes da entrega.'
          else ' pontos precisam ser conferidos antes da entrega.'
        end;
      v_action_url := '/pedidos/' || new.aggregate_id::text;

    when 'commercial_divergence.detected' then
      v_permission := 'commercial_divergence.manage';
      v_priority := 'high';
      v_notify_actor := true;
      v_title := 'Preço da nota diferente do combinado';
      v_message := 'Preço combinado: ' ||
        coalesce(new.payload ->> 'agreed_price', 'não informado') ||
        '. Preço na nota: ' ||
        coalesce(new.payload ->> 'practiced_price', 'não informado') || '.';
      select r.order_id into v_order_id
      from public.receipt_items ri
      join public.receipts r
        on r.id = ri.receipt_id
       and r.company_id = ri.company_id
      where ri.id = new.aggregate_id
        and ri.company_id = new.company_id;
      v_action_url := '/pedidos/' || coalesce(v_order_id::text, '');

    else
      return new;
  end case;

  insert into public.notifications (
    company_id, user_id, type, title, message, priority,
    resource_type, resource_id, action_url, metadata
  )
  select new.company_id, m.user_id, new.event_type, v_title, v_message,
    v_priority, new.aggregate_type, new.aggregate_id, v_action_url, new.payload
  from private.members_with_permission(new.company_id, v_permission) m
  where v_notify_actor
     or new.actor_user_id is null
     or m.user_id <> new.actor_user_id;

  return new;
end;
$$;

revoke all on function private.fanout_notification()
from public, anon, authenticated;

-- Melhora também as notificações de respostas que já estavam armazenadas.
update public.notifications n
set title = s.name || ' respondeu à cotação',
    message = case
      when nullif(n.metadata ->> 'answered_items', '') is null
        or nullif(n.metadata ->> 'total_items', '') is null
        then 'A resposta já está disponível para conferência.'
      when (n.metadata ->> 'total_items')::integer = 1
        then (n.metadata ->> 'answered_items') || ' de 1 produto foi respondido.'
      else (n.metadata ->> 'answered_items') || ' de ' ||
        (n.metadata ->> 'total_items') || ' produtos foram respondidos.'
    end
from public.round_suppliers rs
join public.suppliers s
  on s.company_id = rs.company_id
 and s.id = rs.supplier_id
where n.type = 'quotation.response_submitted'
  and n.resource_type = 'round_supplier'
  and n.resource_id = rs.id
  and n.company_id = rs.company_id;

commit;
