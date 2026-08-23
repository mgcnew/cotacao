-- 0042_whatsapp_procurement_inbox.sql
--
-- Caixa operacional de WhatsApp para Compras. As credenciais da Evolution
-- continuam exclusivamente no servidor; o banco guarda apenas a associação
-- da instância à empresa, conversas, mensagens e a trilha idempotente dos
-- webhooks.

begin;

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  instance_name text not null,
  display_name text not null default 'WhatsApp Compras',
  provider_mode text not null default 'unknown'
    check (provider_mode in ('baileys','cloud','unknown')),
  status text not null default 'unknown'
    check (status in ('unknown','connecting','connected','disconnected','error')),
  phone_number text,
  last_connected_at timestamptz,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, instance_name),
  unique (instance_name)
);

create index whatsapp_connections_company_idx
on public.whatsapp_connections(company_id);

create trigger whatsapp_connections_set_updated_at
before update on public.whatsapp_connections
for each row execute function private.set_updated_at();

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null,
  supplier_id uuid,
  supplier_contact_id uuid,
  purchase_round_id uuid,
  order_id uuid,
  assigned_user_id uuid references auth.users(id) on delete set null,
  remote_jid text not null,
  normalized_phone text,
  display_name text,
  status text not null default 'open'
    check (status in ('open','closed','archived')),
  awaiting_side text check (awaiting_side in ('supplier','buyer')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  last_direction text check (last_direction in ('inbound','outbound')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (connection_id, remote_jid),
  foreign key (company_id, connection_id)
    references public.whatsapp_connections(company_id, id) on delete cascade,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,
  foreign key (company_id, supplier_contact_id)
    references public.supplier_contacts(company_id, id) on delete restrict,
  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete restrict,
  foreign key (company_id, order_id)
    references public.orders(company_id, id) on delete restrict
);

create index whatsapp_conversations_company_activity_idx
on public.whatsapp_conversations(company_id, last_message_at desc nulls last);

create index whatsapp_conversations_supplier_idx
on public.whatsapp_conversations(company_id, supplier_id);

create index whatsapp_conversations_unread_idx
on public.whatsapp_conversations(company_id, last_message_at desc)
where unread_count > 0;

create trigger whatsapp_conversations_set_updated_at
before update on public.whatsapp_conversations
for each row execute function private.set_updated_at();

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text'
    check (message_type in ('text','image','document','audio','video','contact','location','reaction','unknown')),
  body text,
  media_path text,
  media_mime_type text,
  media_file_name text,
  status text not null default 'pending'
    check (status in ('queued','pending','sent','delivered','read','played','failed','deleted')),
  sender_user_id uuid references auth.users(id) on delete set null,
  reply_to_external_id text,
  error_message text,
  occurred_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, connection_id)
    references public.whatsapp_connections(company_id, id) on delete cascade,
  foreign key (company_id, conversation_id)
    references public.whatsapp_conversations(company_id, id) on delete cascade
);

create unique index whatsapp_messages_external_uidx
on public.whatsapp_messages(connection_id, external_message_id)
where external_message_id is not null;

create index whatsapp_messages_conversation_time_idx
on public.whatsapp_messages(conversation_id, occurred_at desc);

create trigger whatsapp_messages_set_updated_at
before update on public.whatsapp_messages
for each row execute function private.set_updated_at();

create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null,
  provider_event_key text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connection_id, provider_event_key),
  foreign key (company_id, connection_id)
    references public.whatsapp_connections(company_id, id) on delete cascade
);

create index whatsapp_webhook_events_pending_idx
on public.whatsapp_webhook_events(received_at)
where status in ('received','failed');

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

revoke all on public.whatsapp_connections from anon;
revoke all on public.whatsapp_conversations from anon;
revoke all on public.whatsapp_messages from anon;
revoke all on public.whatsapp_webhook_events from anon, authenticated;

grant select, insert, update on public.whatsapp_connections to authenticated;
grant select, insert, update on public.whatsapp_conversations to authenticated;
grant select, insert, update on public.whatsapp_messages to authenticated;

create policy whatsapp_connections_select_member
on public.whatsapp_connections for select to authenticated
using ((select private.is_company_member(company_id)));

create policy whatsapp_connections_insert_manage
on public.whatsapp_connections for insert to authenticated
with check ((select private.has_permission(company_id, 'role.manage')));

create policy whatsapp_connections_update_manage
on public.whatsapp_connections for update to authenticated
using ((select private.has_permission(company_id, 'role.manage')))
with check ((select private.has_permission(company_id, 'role.manage')));

create policy whatsapp_conversations_select_member
on public.whatsapp_conversations for select to authenticated
using ((select private.is_company_member(company_id)));

create policy whatsapp_conversations_insert_send
on public.whatsapp_conversations for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.send')));

create policy whatsapp_conversations_update_send
on public.whatsapp_conversations for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.send')))
with check ((select private.has_permission(company_id, 'purchase_round.send')));

create policy whatsapp_messages_select_member
on public.whatsapp_messages for select to authenticated
using ((select private.is_company_member(company_id)));

create policy whatsapp_messages_insert_send
on public.whatsapp_messages for insert to authenticated
with check (
  (select private.has_permission(company_id, 'purchase_round.send'))
  and direction = 'outbound'
  and sender_user_id = (select auth.uid())
);

create policy whatsapp_messages_update_send
on public.whatsapp_messages for update to authenticated
using (
  direction = 'outbound'
  and sender_user_id = (select auth.uid())
  and (select private.has_permission(company_id, 'purchase_round.send'))
)
with check (
  direction = 'outbound'
  and sender_user_id = (select auth.uid())
  and (select private.has_permission(company_id, 'purchase_round.send'))
);

-- A interface escuta apenas as projeções próprias. O segredo da Evolution
-- nunca é necessário no browser.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end;
$$;

commit;
