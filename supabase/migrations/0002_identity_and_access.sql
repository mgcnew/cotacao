begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  document_number text,
  currency_code char(3) not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  logo_path text,
  status text not null default 'active'
    check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create unique index companies_document_number_uidx
on public.companies(document_number)
where document_number is not null;

create trigger companies_set_updated_at
before update on public.companies
for each row execute function private.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_path text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name','')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.handle_new_auth_user() from anon;
revoke all on function private.handle_new_auth_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create index roles_company_id_idx on public.roles(company_id);

create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create index permissions_module_idx on public.permissions(module);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active'
    check (status in ('active','invited','inactive')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, role_id)
    references public.roles(company_id, id) on delete restrict
);

create index company_members_user_company_idx
on public.company_members(user_id, company_id);

create index company_members_company_user_idx
on public.company_members(company_id, user_id);

create index company_members_company_status_idx
on public.company_members(company_id, status);

create index company_members_role_id_idx
on public.company_members(role_id);

create trigger company_members_set_updated_at
before update on public.company_members
for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx
on public.role_permissions(permission_id);

create table public.member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_member_id uuid not null
    references public.company_members(id) on delete cascade,
  permission_id uuid not null
    references public.permissions(id) on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  created_at timestamptz not null default now(),
  unique (company_member_id, permission_id)
);

create index member_permission_overrides_member_idx
on public.member_permission_overrides(company_member_id);

create index member_permission_overrides_permission_idx
on public.member_permission_overrides(permission_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.company_members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_permission_overrides enable row level security;

commit;
