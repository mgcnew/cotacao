-- 0045_supplier_notices.sql
-- Avisos, créditos, combinados e observações com histórico por fornecedor.

begin;

create table public.supplier_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  kind text not null
    check (kind in ('credit','agreement','alert','note')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 1500),
  amount numeric(18,6) check (amount is null or amount > 0),
  due_date date,
  priority text not null default 'normal'
    check (priority in ('normal','high')),
  status text not null default 'open'
    check (status in ('open','resolved')),
  resolution_note text
    check (resolution_note is null or char_length(resolution_note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'Usuário da equipe',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  check (
    (
      status = 'open'
      and resolution_note is null
      and resolved_at is null
      and resolved_by is null
      and resolved_by_name is null
    )
    or
    (status = 'resolved' and resolved_at is not null)
  )
);

create index supplier_notices_supplier_status_idx
on public.supplier_notices(company_id, supplier_id, status, created_at desc);

create index supplier_notices_open_due_date_idx
on public.supplier_notices(company_id, due_date)
where status = 'open' and due_date is not null;

-- Preenche e protege os campos de auditoria mesmo quando a tabela é acessada
-- fora das Server Actions. O nome fica como snapshot: se o perfil mudar ou for
-- removido, o histórico continua dizendo quem registrou e resolveu.
create or replace function private.manage_supplier_notice_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_user_name text;
begin
  v_user_id := auth.uid();

  select nullif(pg_catalog.btrim(p.full_name), '')
    into v_user_name
  from public.profiles p
  where p.id = v_user_id;

  v_user_name := coalesce(v_user_name, 'Usuário da equipe');

  if tg_op = 'INSERT' then
    new.created_by := v_user_id;
    new.created_by_name := v_user_name;
    new.status := 'open';
    new.resolved_by := null;
    new.resolved_by_name := null;
    new.resolved_at := null;
    new.resolution_note := null;
  else
    -- Registro resolvido é histórico. Para corrigi-lo, a pessoa primeiro
    -- reabre; isso evita alterações silenciosas depois da conclusão.
    if old.status = 'resolved' then
      new.kind := old.kind;
      new.title := old.title;
      new.description := old.description;
      new.amount := old.amount;
      new.due_date := old.due_date;
      new.priority := old.priority;
      new.resolution_note := old.resolution_note;
    end if;

    if new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_by := v_user_id;
      new.resolved_by_name := v_user_name;
      new.resolved_at := pg_catalog.now();
    elsif new.status = 'open' and old.status <> 'open' then
      new.resolved_by := null;
      new.resolved_by_name := null;
      new.resolved_at := null;
      new.resolution_note := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger supplier_notices_manage_audit
before insert or update on public.supplier_notices
for each row execute function private.manage_supplier_notice_audit();

create trigger supplier_notices_set_updated_at
before update on public.supplier_notices
for each row execute function private.set_updated_at();

revoke all on function private.manage_supplier_notice_audit()
  from public, anon, authenticated;

alter table public.supplier_notices enable row level security;

revoke all on public.supplier_notices from anon;
grant select, insert on public.supplier_notices to authenticated;

-- A equipe pode alterar apenas o conteúdo e o andamento. Empresa, fornecedor,
-- autoria e datas de auditoria ficam fora do alcance da API autenticada.
grant update (
  kind,
  title,
  description,
  amount,
  due_date,
  priority,
  status,
  resolution_note
) on public.supplier_notices to authenticated;

create policy supplier_notices_select_member
on public.supplier_notices
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_notices_insert_manage
on public.supplier_notices
for insert to authenticated
with check (
  (select private.has_permission(company_id, 'supplier.update'))
  and created_by = (select auth.uid())
);

create policy supplier_notices_update_manage
on public.supplier_notices
for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

commit;
