-- Um lembrete por revisão enviada pela integração. Não cobra pedidos antigos.
begin;

alter table public.communication_logs drop constraint communication_logs_message_kind_check;
alter table public.communication_logs add constraint communication_logs_message_kind_check
  check (message_kind in ('quotation_invitation', 'quotation_reminder', 'order_confirmation',
    'order_confirmation_reminder', 'delivery_notice', 'divergence', 'general', 'other'));

create table public.order_confirmation_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  order_revision_id uuid not null,
  source_communication_id uuid not null,
  communication_log_id uuid,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  claimed_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (company_id, order_revision_id),
  foreign key (company_id, order_revision_id)
    references public.order_revisions(company_id, id) on delete restrict,
  foreign key (company_id, source_communication_id)
    references public.communication_logs(company_id, id) on delete restrict,
  foreign key (company_id, communication_log_id)
    references public.communication_logs(company_id, id) on delete restrict
);
create index order_confirmation_reminders_due_idx
  on public.order_confirmation_reminders(due_at) where status = 'pending';

alter table public.order_confirmation_reminders enable row level security;
revoke all on public.order_confirmation_reminders from anon, authenticated;
grant select on public.order_confirmation_reminders to authenticated;
grant all on public.order_confirmation_reminders to service_role;
create policy order_confirmation_reminders_select on public.order_confirmation_reminders
  for select to authenticated using ((select private.has_permission(company_id, 'order.view')));

create function private.schedule_order_confirmation_reminder()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- O prazo começa no envio aceito pelo provedor. A confirmação de entrega
  -- pode chegar bem depois e não deve reiniciar o relógio.
  if new.provider = 'evolution' and new.channel = 'whatsapp'
     and new.direction = 'outbound' and new.message_kind = 'order_confirmation'
     and new.status in ('sent', 'delivered') and new.sent_at is not null
     and new.order_revision_id is not null and new.supplier_contact_id is not null
     and (tg_op = 'INSERT' or old.sent_at is null) then
    insert into public.order_confirmation_reminders
      (company_id, order_revision_id, source_communication_id, due_at)
    values (new.company_id, new.order_revision_id, new.id, new.sent_at + interval '1 hour')
    on conflict (company_id, order_revision_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.schedule_order_confirmation_reminder() from public, anon, authenticated;
create trigger communication_logs_schedule_order_reminder
  after insert or update on public.communication_logs
  for each row execute function private.schedule_order_confirmation_reminder();

-- Reserva atômica: duas execuções do agendador não enviam a mesma cobrança.
create function public.rpc_service_claim_order_confirmation_reminders(p_limit integer default 10)
returns setof public.order_confirmation_reminders
language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
begin
  -- Uma interrupção após chamar o provedor tem resultado incerto. Não repetir
  -- automaticamente: o operador pode conferir a conversa antes de reenviar.
  update public.order_confirmation_reminders
  set status = 'failed', error_message = 'Processamento interrompido. Confira a conversa antes de reenviar.'
  where status = 'processing' and claimed_at < now() - interval '10 minutes';

  update public.order_confirmation_reminders reminder
  set status = 'skipped'
  where reminder.status = 'pending' and reminder.due_at <= now()
    and not exists (
      select 1 from public.order_revisions revision
      join public.orders pedido on pedido.company_id = revision.company_id and pedido.id = revision.order_id
      where revision.company_id = reminder.company_id and revision.id = reminder.order_revision_id
        and revision.status = 'sent' and pedido.status = 'awaiting_confirmation'
        and pedido.current_revision_id = revision.id
    );

  if extract(isodow from v_local) > 5
     or v_local::time < time '08:00' or v_local::time >= time '18:00' then
    return;
  end if;

  return query
  with candidates as (
    select reminder.id from public.order_confirmation_reminders reminder
    where reminder.status = 'pending' and reminder.due_at <= now()
      and exists (select 1 from public.whatsapp_connections connection
        where connection.company_id = reminder.company_id and connection.status = 'connected')
    order by reminder.due_at, reminder.id
    limit greatest(1, least(coalesce(p_limit, 10), 20))
    for update of reminder skip locked
  )
  update public.order_confirmation_reminders reminder
  set status = 'processing', claimed_at = now()
  from candidates where reminder.id = candidates.id
  returning reminder.*;
end;
$$;
revoke all on function public.rpc_service_claim_order_confirmation_reminders(integer) from public, anon, authenticated;
grant execute on function public.rpc_service_claim_order_confirmation_reminders(integer) to service_role;

-- Preserva os modelos personalizados, substituindo a lista pela contagem.
update public.whatsapp_message_templates
set body = replace(body, '{itens}', '{quantidade_itens}')
where kind = 'order_confirmation' and body like '%{itens}%';

commit;
