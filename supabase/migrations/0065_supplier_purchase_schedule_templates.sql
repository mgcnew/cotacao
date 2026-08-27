-- 0065_supplier_purchase_schedule_templates.sql
-- Produtos e quantidades habituais que preenchem pedidos/cotações recorrentes.

begin;

create table public.supplier_purchase_schedule_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  schedule_id uuid not null,
  product_id uuid not null,
  default_quantity numeric(18,6) not null check (default_quantity > 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (schedule_id, product_id),
  check (notes is null or char_length(notes) <= 300),
  foreign key (company_id, schedule_id)
    references public.supplier_purchase_schedules(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict
);

create index supplier_purchase_schedule_items_company_idx
on public.supplier_purchase_schedule_items(company_id);

create index supplier_purchase_schedule_items_schedule_idx
on public.supplier_purchase_schedule_items(schedule_id, sort_order, created_at);

create trigger supplier_purchase_schedule_items_set_updated_at
before update on public.supplier_purchase_schedule_items
for each row execute function private.set_updated_at();

alter table public.supplier_purchase_schedule_items enable row level security;

revoke all on public.supplier_purchase_schedule_items from anon;
grant select, insert, update, delete
on public.supplier_purchase_schedule_items to authenticated;

create policy supplier_purchase_schedule_items_select
on public.supplier_purchase_schedule_items for select to authenticated
using ((select private.is_company_member(company_id)));

create policy supplier_purchase_schedule_items_insert
on public.supplier_purchase_schedule_items for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_schedule_items_update
on public.supplier_purchase_schedule_items for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_schedule_items_delete
on public.supplier_purchase_schedule_items for delete to authenticated
using ((select private.has_permission(company_id, 'supplier.update')));

commit;
