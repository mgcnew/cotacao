-- 0006_suppliers.sql
-- Fornecedores, contatos, catálogo conhecido e agenda.

begin;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  legal_name text,
  document_number text,
  purchase_limit numeric(18,6),
  status text not null default 'active'
    check (status in ('active','inactive','blocked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check (purchase_limit is null or purchase_limit >= 0)
);

create index suppliers_company_id_idx on public.suppliers(company_id);
create index suppliers_company_name_idx on public.suppliers(company_id, name);

create unique index suppliers_company_document_uidx
on public.suppliers(company_id, document_number)
where document_number is not null;

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function private.set_updated_at();

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  name text not null,
  role text,
  whatsapp text,
  phone text,
  email text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade
);

create index supplier_contacts_company_idx on public.supplier_contacts(company_id);
create index supplier_contacts_supplier_idx on public.supplier_contacts(supplier_id);

create unique index supplier_contacts_one_primary_active_uidx
on public.supplier_contacts(supplier_id)
where is_primary = true and is_active = true;

create trigger supplier_contacts_set_updated_at
before update on public.supplier_contacts
for each row execute function private.set_updated_at();

create table public.supplier_categories (
  company_id uuid not null,
  supplier_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (supplier_id, category_id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete cascade
);

create index supplier_categories_company_idx on public.supplier_categories(company_id);
create index supplier_categories_category_idx on public.supplier_categories(category_id);

create table public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  product_id uuid not null,
  status text not null default 'probable'
    check (status in ('confirmed','probable','does_not_supply','inactive')),
  source text not null default 'manual'
    check (source in ('manual','quotation_response','purchase','supplier_declared','system')),
  manually_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, supplier_id, product_id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade
);

create index supplier_products_company_idx on public.supplier_products(company_id);
create index supplier_products_supplier_product_idx
on public.supplier_products(supplier_id, product_id);
create index supplier_products_product_status_idx
on public.supplier_products(product_id, status);

create trigger supplier_products_set_updated_at
before update on public.supplier_products
for each row execute function private.set_updated_at();

create table public.supplier_purchase_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  category_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  preferred_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete restrict
);

create index supplier_purchase_schedules_company_idx
on public.supplier_purchase_schedules(company_id);
create index supplier_purchase_schedules_supplier_idx
on public.supplier_purchase_schedules(supplier_id);
create index supplier_purchase_schedules_weekday_idx
on public.supplier_purchase_schedules(company_id, weekday)
where is_active = true;

create trigger supplier_purchase_schedules_set_updated_at
before update on public.supplier_purchase_schedules
for each row execute function private.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_purchase_schedules enable row level security;

revoke all on public.suppliers from anon;
revoke all on public.supplier_contacts from anon;
revoke all on public.supplier_categories from anon;
revoke all on public.supplier_products from anon;
revoke all on public.supplier_purchase_schedules from anon;

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.supplier_contacts to authenticated;
grant select, insert, delete on public.supplier_categories to authenticated;
grant select, insert, update on public.supplier_products to authenticated;
grant select, insert, update, delete on public.supplier_purchase_schedules to authenticated;

create policy suppliers_select_member on public.suppliers
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy suppliers_insert_create on public.suppliers
for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.create')));

create policy suppliers_update_update on public.suppliers
for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_contacts_select_member on public.supplier_contacts
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_contacts_insert_manage on public.supplier_contacts
for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_contacts_update_manage on public.supplier_contacts
for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_categories_select_member on public.supplier_categories
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_categories_insert_manage on public.supplier_categories
for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_categories_delete_manage on public.supplier_categories
for delete to authenticated
using ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_products_select_member on public.supplier_products
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_products_insert_manage on public.supplier_products
for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_products_update_manage on public.supplier_products
for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_schedules_select_member
on public.supplier_purchase_schedules
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_purchase_schedules_insert_manage
on public.supplier_purchase_schedules
for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_schedules_update_manage
on public.supplier_purchase_schedules
for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_schedules_delete_manage
on public.supplier_purchase_schedules
for delete to authenticated
using ((select private.has_permission(company_id, 'supplier.update')));

commit;
