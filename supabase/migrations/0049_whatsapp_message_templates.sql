create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('quotation_invitation', 'quotation_reminder')),
  body text not null check (char_length(body) between 20 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kind)
);

create trigger whatsapp_message_templates_set_updated_at
before update on public.whatsapp_message_templates
for each row execute function private.set_updated_at();

alter table public.whatsapp_message_templates enable row level security;

revoke all on public.whatsapp_message_templates from anon;
grant select, insert, update, delete on public.whatsapp_message_templates to authenticated;

create policy whatsapp_message_templates_select_member
on public.whatsapp_message_templates for select to authenticated
using ((select private.is_company_member(company_id)));

create policy whatsapp_message_templates_insert_manage
on public.whatsapp_message_templates for insert to authenticated
with check ((select private.has_permission(company_id, 'role.manage')));

create policy whatsapp_message_templates_update_manage
on public.whatsapp_message_templates for update to authenticated
using ((select private.has_permission(company_id, 'role.manage')))
with check ((select private.has_permission(company_id, 'role.manage')));

create policy whatsapp_message_templates_delete_manage
on public.whatsapp_message_templates for delete to authenticated
using ((select private.has_permission(company_id, 'role.manage')));
