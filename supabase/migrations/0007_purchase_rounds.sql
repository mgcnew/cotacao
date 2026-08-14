-- 0007_purchase_rounds.sql
-- Rodadas, grupos, itens, fornecedores participantes e distribuição.

begin;

create table public.purchase_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','active','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index purchase_rounds_company_status_idx
on public.purchase_rounds(company_id, status);
create index purchase_rounds_created_at_idx
on public.purchase_rounds(company_id, created_at desc);

create trigger purchase_rounds_set_updated_at
before update on public.purchase_rounds
for each row execute function private.set_updated_at();

create table public.purchase_round_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','open','closed','cancelled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (purchase_round_id, name),
  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete cascade
);

create index purchase_round_groups_round_idx
on public.purchase_round_groups(purchase_round_id);

create trigger purchase_round_groups_set_updated_at
before update on public.purchase_round_groups
for each row execute function private.set_updated_at();

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  group_id uuid not null,
  product_id uuid not null,
  requested_quantity numeric(18,6) not null check (requested_quantity > 0),
  purchase_unit_id uuid not null,
  pricing_unit_id uuid not null,
  comparison_unit_id uuid,
  estimated_pricing_quantity numeric(18,6),
  estimated_conversion_rate numeric(18,6),
  commercial_status text not null default 'open'
    check (commercial_status in (
      'open','allocated','confirmed','closed_without_purchase','cancelled'
    )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),

  check (estimated_pricing_quantity is null or estimated_pricing_quantity >= 0),
  check (estimated_conversion_rate is null or estimated_conversion_rate > 0),

  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete cascade,
  foreign key (company_id, group_id)
    references public.purchase_round_groups(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,
  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, pricing_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, comparison_unit_id)
    references public.units(company_id, id) on delete restrict
);

create index quotation_items_round_idx on public.quotation_items(purchase_round_id);
create index quotation_items_group_idx on public.quotation_items(group_id);
create index quotation_items_product_idx on public.quotation_items(product_id);
create index quotation_items_round_status_idx
on public.quotation_items(purchase_round_id, commercial_status);

create trigger quotation_items_set_updated_at
before update on public.quotation_items
for each row execute function private.set_updated_at();

create table public.round_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  supplier_id uuid not null,
  supplier_contact_id uuid,
  first_sent_at timestamptz,
  first_accessed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (purchase_round_id, supplier_id),

  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete cascade,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,
  foreign key (company_id, supplier_contact_id)
    references public.supplier_contacts(company_id, id) on delete restrict
);

create index round_suppliers_round_idx on public.round_suppliers(purchase_round_id);
create index round_suppliers_supplier_idx on public.round_suppliers(supplier_id);

create trigger round_suppliers_set_updated_at
before update on public.round_suppliers
for each row execute function private.set_updated_at();

create table public.supplier_quotation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  round_supplier_id uuid not null,
  quotation_item_id uuid not null,
  added_after_initial_send boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (round_supplier_id, quotation_item_id),

  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete cascade,
  foreign key (company_id, quotation_item_id)
    references public.quotation_items(company_id, id) on delete cascade
);

create index supplier_quotation_items_round_supplier_idx
on public.supplier_quotation_items(round_supplier_id);
create index supplier_quotation_items_item_idx
on public.supplier_quotation_items(quotation_item_id);

create trigger supplier_quotation_items_set_updated_at
before update on public.supplier_quotation_items
for each row execute function private.set_updated_at();


-- ============================================================
-- INTEGRIDADE DE DOMÍNIO
-- ============================================================

create or replace function private.validate_quotation_item_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.purchase_round_groups g
    where g.id = new.group_id
      and g.company_id = new.company_id
      and g.purchase_round_id = new.purchase_round_id
  ) then
    raise exception 'group_id não pertence à purchase_round_id informada';
  end if;
  return new;
end;
$$;

create trigger quotation_items_validate_group
before insert or update of company_id, purchase_round_id, group_id
on public.quotation_items
for each row execute function private.validate_quotation_item_group();

create or replace function private.validate_round_supplier_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.supplier_contact_id is not null and not exists (
    select 1
    from public.supplier_contacts sc
    where sc.id = new.supplier_contact_id
      and sc.company_id = new.company_id
      and sc.supplier_id = new.supplier_id
  ) then
    raise exception 'supplier_contact_id não pertence ao supplier_id informado';
  end if;
  return new;
end;
$$;

create trigger round_suppliers_validate_contact
before insert or update of company_id, supplier_id, supplier_contact_id
on public.round_suppliers
for each row execute function private.validate_round_supplier_contact();

create or replace function private.validate_supplier_quotation_item_round()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  supplier_round_id uuid;
  item_round_id uuid;
begin
  select rs.purchase_round_id
    into supplier_round_id
  from public.round_suppliers rs
  where rs.id = new.round_supplier_id
    and rs.company_id = new.company_id;

  select qi.purchase_round_id
    into item_round_id
  from public.quotation_items qi
  where qi.id = new.quotation_item_id
    and qi.company_id = new.company_id;

  if supplier_round_id is null or item_round_id is null
     or supplier_round_id <> item_round_id then
    raise exception 'Fornecedor e item devem pertencer à mesma Rodada de Compras';
  end if;

  return new;
end;
$$;

create trigger supplier_quotation_items_validate_round
before insert or update of company_id, round_supplier_id, quotation_item_id
on public.supplier_quotation_items
for each row execute function private.validate_supplier_quotation_item_round();

alter table public.purchase_rounds enable row level security;
alter table public.purchase_round_groups enable row level security;
alter table public.quotation_items enable row level security;
alter table public.round_suppliers enable row level security;
alter table public.supplier_quotation_items enable row level security;

revoke all on public.purchase_rounds from anon;
revoke all on public.purchase_round_groups from anon;
revoke all on public.quotation_items from anon;
revoke all on public.round_suppliers from anon;
revoke all on public.supplier_quotation_items from anon;

grant select, insert, update on public.purchase_rounds to authenticated;
grant select, insert, update on public.purchase_round_groups to authenticated;
grant select, insert, update on public.quotation_items to authenticated;
grant select, insert, update on public.round_suppliers to authenticated;
grant select, insert, update on public.supplier_quotation_items to authenticated;

create policy purchase_rounds_select_member on public.purchase_rounds
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy purchase_rounds_insert_create on public.purchase_rounds
for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.create')));

create policy purchase_rounds_update_update on public.purchase_rounds
for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.update')))
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy purchase_round_groups_select_member on public.purchase_round_groups
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy purchase_round_groups_insert_update on public.purchase_round_groups
for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy purchase_round_groups_update_update on public.purchase_round_groups
for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.update')))
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy quotation_items_select_member on public.quotation_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy quotation_items_insert_update on public.quotation_items
for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy quotation_items_update_update on public.quotation_items
for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.update')))
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy round_suppliers_select_member on public.round_suppliers
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy round_suppliers_insert_update on public.round_suppliers
for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy round_suppliers_update_update on public.round_suppliers
for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.update')))
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy supplier_quotation_items_select_member on public.supplier_quotation_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_quotation_items_insert_update on public.supplier_quotation_items
for insert to authenticated
with check ((select private.has_permission(company_id, 'purchase_round.update')));

create policy supplier_quotation_items_update_update on public.supplier_quotation_items
for update to authenticated
using ((select private.has_permission(company_id, 'purchase_round.update')))
with check ((select private.has_permission(company_id, 'purchase_round.update')));

commit;
