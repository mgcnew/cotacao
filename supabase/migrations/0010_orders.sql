-- 0010_orders.sql
-- Pedidos versionados e divergências pré-entrega.

begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  purchase_round_id uuid,
  origin text not null
    check (origin in ('purchase_round','direct')),
  order_number bigint generated always as identity,
  status text not null default 'draft'
    check (status in (
      'draft',
      'awaiting_confirmation',
      'awaiting_delivery',
      'partially_received',
      'received',
      'cancelled'
    )),
  current_revision_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, order_number),

  check (
    (origin = 'purchase_round' and purchase_round_id is not null)
    or
    (origin = 'direct' and purchase_round_id is null)
  ),

  foreign key (company_id)
    references public.companies(id) on delete restrict,

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,

  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete restrict
);

create index orders_company_status_idx on public.orders(company_id, status);
create index orders_supplier_idx on public.orders(supplier_id);
create index orders_round_idx on public.orders(purchase_round_id);
create index orders_created_at_idx on public.orders(company_id, created_at desc);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create table public.order_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  status text not null default 'draft'
    check (status in ('draft','sent','confirmed','contested','superseded','cancelled')),
  delivery_due_date date,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (company_id, id),
  unique (order_id, revision_number),

  foreign key (company_id, order_id)
    references public.orders(company_id, id) on delete cascade
);

create index order_revisions_order_idx
on public.order_revisions(order_id, revision_number desc);

alter table public.orders
  add constraint orders_current_revision_fk
  foreign key (company_id, current_revision_id)
  references public.order_revisions(company_id, id)
  on delete restrict;

create table public.order_revision_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_revision_id uuid not null,
  purchase_allocation_id uuid,
  product_id uuid not null,

  product_name_snapshot text not null,

  requested_quantity numeric(18,6) not null check (requested_quantity > 0),

  purchase_unit_id uuid not null,
  pricing_unit_id uuid not null,
  comparison_unit_id uuid,

  estimated_pricing_quantity numeric(18,6),

  agreed_price numeric(18,6) not null check (agreed_price >= 0),

  notes text,

  created_at timestamptz not null default now(),

  unique (company_id, id),

  check (estimated_pricing_quantity is null or estimated_pricing_quantity >= 0),

  foreign key (company_id, order_revision_id)
    references public.order_revisions(company_id, id) on delete cascade,

  foreign key (company_id, purchase_allocation_id)
    references public.purchase_allocations(company_id, id) on delete restrict,

  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,

  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,

  foreign key (company_id, pricing_unit_id)
    references public.units(company_id, id) on delete restrict,

  foreign key (company_id, comparison_unit_id)
    references public.units(company_id, id) on delete restrict
);

create index order_revision_items_revision_idx
on public.order_revision_items(order_revision_id);

create index order_revision_items_product_idx
on public.order_revision_items(product_id);

create index order_revision_items_allocation_idx
on public.order_revision_items(purchase_allocation_id);

create table public.order_divergences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  order_revision_id uuid not null,
  order_revision_item_id uuid,
  type text not null
    check (type in ('quantity','price','delivery_date','availability','specification','other')),
  current_value jsonb,
  proposed_value jsonb,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','resolved','cancelled')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id, order_id)
    references public.orders(company_id, id) on delete cascade,

  foreign key (company_id, order_revision_id)
    references public.order_revisions(company_id, id) on delete cascade,

  foreign key (company_id, order_revision_item_id)
    references public.order_revision_items(company_id, id) on delete cascade
);

create index order_divergences_order_status_idx
on public.order_divergences(order_id, status);

create trigger order_divergences_set_updated_at
before update on public.order_divergences
for each row execute function private.set_updated_at();

create or replace function private.validate_order_current_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_revision_id is not null and not exists (
    select 1
    from public.order_revisions r
    where r.id = new.current_revision_id
      and r.company_id = new.company_id
      and r.order_id = new.id
  ) then
    raise exception 'current_revision_id não pertence ao pedido';
  end if;
  return new;
end;
$$;

create trigger orders_validate_current_revision
before insert or update of company_id, current_revision_id
on public.orders
for each row execute function private.validate_order_current_revision();

create or replace function private.validate_order_divergence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.order_revisions r
    where r.id = new.order_revision_id
      and r.company_id = new.company_id
      and r.order_id = new.order_id
  ) then
    raise exception 'order_revision_id não pertence ao pedido';
  end if;

  if new.order_revision_item_id is not null and not exists (
    select 1
    from public.order_revision_items i
    where i.id = new.order_revision_item_id
      and i.company_id = new.company_id
      and i.order_revision_id = new.order_revision_id
  ) then
    raise exception 'order_revision_item_id não pertence à revisão';
  end if;

  return new;
end;
$$;

create trigger order_divergences_validate
before insert or update of company_id, order_id, order_revision_id, order_revision_item_id
on public.order_divergences
for each row execute function private.validate_order_divergence();

alter table public.orders enable row level security;
alter table public.order_revisions enable row level security;
alter table public.order_revision_items enable row level security;
alter table public.order_divergences enable row level security;

revoke all on public.orders from anon;
revoke all on public.order_revisions from anon;
revoke all on public.order_revision_items from anon;
revoke all on public.order_divergences from anon;

grant select, insert on public.orders to authenticated;
grant select, insert on public.order_revisions to authenticated;
grant select, insert on public.order_revision_items to authenticated;
grant select on public.order_divergences to authenticated;

create policy orders_select_member on public.orders
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy orders_insert_create on public.orders
for insert to authenticated
with check (
  status = 'draft'
  and (select private.has_permission(company_id, 'order.create'))
);

create policy order_revisions_select_member on public.order_revisions
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy order_revisions_insert_create on public.order_revisions
for insert to authenticated
with check (
  status = 'draft'
  and (
    (select private.has_permission(company_id, 'order.create'))
    or
    (select private.has_permission(company_id, 'order.revise'))
  )
);

create policy order_revision_items_select_member on public.order_revision_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy order_revision_items_insert_create on public.order_revision_items
for insert to authenticated
with check (
  (select private.has_permission(company_id, 'order.create'))
  or
  (select private.has_permission(company_id, 'order.revise'))
);

create policy order_divergences_select_member on public.order_divergences
for select to authenticated
using ((select private.is_company_member(company_id)));

commit;
