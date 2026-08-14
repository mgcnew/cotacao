-- 0011_receiving.sql
-- Recebimentos e divergências comerciais pós-entrega.

begin;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft','posted','voided')),
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id, order_id)
    references public.orders(company_id, id) on delete restrict
);

create index receipts_order_idx on public.receipts(order_id);
create index receipts_company_status_idx on public.receipts(company_id, status);
create index receipts_received_at_idx on public.receipts(company_id, received_at desc);

create trigger receipts_set_updated_at
before update on public.receipts
for each row execute function private.set_updated_at();

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  receipt_id uuid not null,
  order_revision_item_id uuid not null,

  logistic_quantity_received numeric(18,6) not null
    check (logistic_quantity_received >= 0),

  pricing_quantity_received numeric(18,6) not null
    check (pricing_quantity_received >= 0),

  practiced_price numeric(18,6) not null
    check (practiced_price >= 0),

  notes text,

  created_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id, receipt_id)
    references public.receipts(company_id, id) on delete cascade,

  foreign key (company_id, order_revision_item_id)
    references public.order_revision_items(company_id, id) on delete restrict
);

create index receipt_items_receipt_idx on public.receipt_items(receipt_id);
create index receipt_items_revision_item_idx
on public.receipt_items(order_revision_item_id);

create table public.commercial_divergences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  order_id uuid not null,
  order_revision_item_id uuid not null,
  receipt_item_id uuid not null,

  type text not null
    check (type in ('price','quantity','specification','other')),

  agreed_value jsonb,
  realized_value jsonb,

  financial_impact numeric(18,6),

  status text not null default 'pending'
    check (status in ('pending','accepted','to_dispute','resolved','justified')),

  resolution_notes text,

  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,

  foreign key (company_id, order_id)
    references public.orders(company_id, id) on delete restrict,

  foreign key (company_id, order_revision_item_id)
    references public.order_revision_items(company_id, id) on delete restrict,

  foreign key (company_id, receipt_item_id)
    references public.receipt_items(company_id, id) on delete restrict
);

create index commercial_divergences_company_status_idx
on public.commercial_divergences(company_id, status);

create index commercial_divergences_supplier_idx
on public.commercial_divergences(supplier_id);

create trigger commercial_divergences_set_updated_at
before update on public.commercial_divergences
for each row execute function private.set_updated_at();

create or replace function private.validate_receipt_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  receipt_order_id uuid;
  revision_order_id uuid;
begin
  select r.order_id
    into receipt_order_id
  from public.receipts r
  where r.id = new.receipt_id
    and r.company_id = new.company_id;

  select orev.order_id
    into revision_order_id
  from public.order_revision_items ori
  join public.order_revisions orev
    on orev.id = ori.order_revision_id
   and orev.company_id = ori.company_id
  where ori.id = new.order_revision_item_id
    and ori.company_id = new.company_id;

  if receipt_order_id is null
     or revision_order_id is null
     or receipt_order_id <> revision_order_id then
    raise exception 'Item recebido não pertence ao pedido do recebimento';
  end if;

  return new;
end;
$$;

create trigger receipt_items_validate
before insert or update of company_id, receipt_id, order_revision_item_id
on public.receipt_items
for each row execute function private.validate_receipt_item();

create or replace function private.validate_commercial_divergence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_supplier_id uuid;
  item_order_id uuid;
  receipt_item_order_id uuid;
begin
  select o.supplier_id
    into order_supplier_id
  from public.orders o
  where o.id = new.order_id
    and o.company_id = new.company_id;

  select r.order_id
    into item_order_id
  from public.order_revision_items ori
  join public.order_revisions r
    on r.id = ori.order_revision_id
   and r.company_id = ori.company_id
  where ori.id = new.order_revision_item_id
    and ori.company_id = new.company_id;

  select rec.order_id
    into receipt_item_order_id
  from public.receipt_items ri
  join public.receipts rec
    on rec.id = ri.receipt_id
   and rec.company_id = ri.company_id
  where ri.id = new.receipt_item_id
    and ri.company_id = new.company_id;

  if order_supplier_id is null
     or order_supplier_id <> new.supplier_id
     or item_order_id <> new.order_id
     or receipt_item_order_id <> new.order_id then
    raise exception 'Divergência comercial inconsistente com pedido, fornecedor ou recebimento';
  end if;

  return new;
end;
$$;

create trigger commercial_divergences_validate
before insert or update of
  company_id,
  supplier_id,
  order_id,
  order_revision_item_id,
  receipt_item_id
on public.commercial_divergences
for each row execute function private.validate_commercial_divergence();

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.commercial_divergences enable row level security;

revoke all on public.receipts from anon;
revoke all on public.receipt_items from anon;
revoke all on public.commercial_divergences from anon;

grant select, insert on public.receipts to authenticated;
grant select, insert on public.receipt_items to authenticated;
grant select, insert, update on public.commercial_divergences to authenticated;

create policy receipts_select_member on public.receipts
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy receipts_insert_create on public.receipts
for insert to authenticated
with check (
  status = 'draft'
  and (select private.has_permission(company_id, 'receipt.create'))
);

create policy receipt_items_select_member on public.receipt_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy receipt_items_insert_create on public.receipt_items
for insert to authenticated
with check ((select private.has_permission(company_id, 'receipt.create')));

create policy commercial_divergences_select_member
on public.commercial_divergences
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy commercial_divergences_insert_create
on public.commercial_divergences
for insert to authenticated
with check (
  (select private.has_permission(company_id, 'commercial_divergence.create'))
  or
  (select private.has_permission(company_id, 'commercial_divergence.manage'))
);

create policy commercial_divergences_update_manage
on public.commercial_divergences
for update to authenticated
using ((select private.has_permission(company_id, 'commercial_divergence.manage')))
with check ((select private.has_permission(company_id, 'commercial_divergence.manage')));

commit;
