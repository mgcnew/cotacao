-- 0012_public_access_communication_events.sql
-- Tokens públicos, comunicação, notificações, eventos e auditoria.

begin;

create table public.public_access_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purpose text not null
    check (purpose in ('quotation_response','order_confirmation')),

  supplier_id uuid not null,
  round_supplier_id uuid,
  order_revision_id uuid,

  token_hash text not null unique,

  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,

  created_at timestamptz not null default now(),

  unique (company_id, id),

  check (
    (purpose = 'quotation_response'
      and round_supplier_id is not null
      and order_revision_id is null)
    or
    (purpose = 'order_confirmation'
      and order_revision_id is not null
      and round_supplier_id is null)
  ),

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,

  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete cascade,

  foreign key (company_id, order_revision_id)
    references public.order_revisions(company_id, id) on delete cascade
);

create index public_access_tokens_company_purpose_idx
on public.public_access_tokens(company_id, purpose);

create index public_access_tokens_round_supplier_idx
on public.public_access_tokens(round_supplier_id);

create index public_access_tokens_order_revision_idx
on public.public_access_tokens(order_revision_id);

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,

  supplier_id uuid not null,
  supplier_contact_id uuid,

  round_supplier_id uuid,
  order_revision_id uuid,

  channel text not null
    check (channel in ('whatsapp','email','sms','other')),

  provider text not null,

  direction text not null default 'outbound'
    check (direction in ('outbound','inbound')),

  status text not null
    check (status in ('queued','sent','delivered','failed')),

  external_message_id text,
  error_message text,

  sent_at timestamptz,
  delivered_at timestamptz,

  created_at timestamptz not null default now(),

  unique (company_id, id),

  check (num_nonnulls(round_supplier_id, order_revision_id) <= 1),

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,

  foreign key (company_id, supplier_contact_id)
    references public.supplier_contacts(company_id, id) on delete restrict,

  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete restrict,

  foreign key (company_id, order_revision_id)
    references public.order_revisions(company_id, id) on delete restrict
);

create index communication_logs_company_created_idx
on public.communication_logs(company_id, created_at desc);

create index communication_logs_supplier_idx
on public.communication_logs(supplier_id);

create index communication_logs_round_supplier_idx
on public.communication_logs(round_supplier_id);

create index communication_logs_order_revision_idx
on public.communication_logs(order_revision_id);

create index communication_logs_external_message_idx
on public.communication_logs(external_message_id)
where external_message_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,

  type text not null,
  title text not null,
  message text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),

  resource_type text,
  resource_id uuid,
  action_url text,

  metadata jsonb not null default '{}'::jsonb,

  read_at timestamptz,
  created_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id)
    references public.companies(id) on delete restrict
);

create index notifications_user_unread_idx
on public.notifications(user_id, created_at desc)
where read_at is null;

create index notifications_company_created_idx
on public.notifications(company_id, created_at desc);

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,

  event_type text not null,

  aggregate_type text not null,
  aggregate_id uuid not null,

  actor_type text not null
    check (actor_type in ('user','supplier','system')),

  actor_user_id uuid references auth.users(id) on delete set null,
  actor_supplier_id uuid,

  payload jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (company_id, id),

  check (
    (actor_type = 'user' and actor_user_id is not null and actor_supplier_id is null)
    or
    (actor_type = 'supplier' and actor_supplier_id is not null and actor_user_id is null)
    or
    (actor_type = 'system' and actor_user_id is null and actor_supplier_id is null)
  ),

  foreign key (company_id)
    references public.companies(id) on delete restrict,

  foreign key (company_id, actor_supplier_id)
    references public.suppliers(company_id, id) on delete restrict
);

create index domain_events_company_occurred_idx
on public.domain_events(company_id, occurred_at desc);

create index domain_events_aggregate_idx
on public.domain_events(company_id, aggregate_type, aggregate_id, occurred_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,

  action text not null,

  entity_type text not null,
  entity_id uuid,

  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id)
    references public.companies(id) on delete restrict
);

create index audit_logs_company_created_idx
on public.audit_logs(company_id, created_at desc);

create index audit_logs_entity_idx
on public.audit_logs(company_id, entity_type, entity_id, created_at desc);

-- Integridade do token: supplier deve corresponder ao recurso.
create or replace function private.validate_public_access_token()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resource_supplier_id uuid;
begin
  if new.purpose = 'quotation_response' then
    select rs.supplier_id
      into resource_supplier_id
    from public.round_suppliers rs
    where rs.id = new.round_supplier_id
      and rs.company_id = new.company_id;
  elsif new.purpose = 'order_confirmation' then
    select o.supplier_id
      into resource_supplier_id
    from public.order_revisions r
    join public.orders o
      on o.id = r.order_id
     and o.company_id = r.company_id
    where r.id = new.order_revision_id
      and r.company_id = new.company_id;
  end if;

  if resource_supplier_id is null or resource_supplier_id <> new.supplier_id then
    raise exception 'Token público inconsistente com fornecedor/recurso';
  end if;

  return new;
end;
$$;

create trigger public_access_tokens_validate
before insert or update of
  company_id,
  purpose,
  supplier_id,
  round_supplier_id,
  order_revision_id
on public.public_access_tokens
for each row execute function private.validate_public_access_token();

alter table public.public_access_tokens enable row level security;
alter table public.communication_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.domain_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.public_access_tokens from anon;
revoke all on public.communication_logs from anon;
revoke all on public.notifications from anon;
revoke all on public.domain_events from anon;
revoke all on public.audit_logs from anon;

-- Tokens públicos serão usados apenas por backend/RPC segura.
grant select on public.communication_logs to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.domain_events to authenticated;
grant select on public.audit_logs to authenticated;

create policy communication_logs_select_member
on public.communication_logs
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy notifications_select_own
on public.notifications
for select to authenticated
using (
  user_id = auth.uid()
  and (select private.is_company_member(company_id))
);

create policy notifications_update_own
on public.notifications
for update to authenticated
using (
  user_id = auth.uid()
  and (select private.is_company_member(company_id))
)
with check (
  user_id = auth.uid()
  and (select private.is_company_member(company_id))
);

create policy domain_events_select_member
on public.domain_events
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy audit_logs_select_authorized
on public.audit_logs
for select to authenticated
using (
  (select private.is_company_member(company_id))
  and (
    (select private.has_permission(company_id, 'role.manage'))
    or
    (select private.has_permission(company_id, 'analytics.view'))
  )
);

commit;
