-- 0009_purchase_allocations.sql
-- Decisões de compra / alocações por fornecedor.

begin;

create table public.purchase_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_round_id uuid not null,
  quotation_item_id uuid not null,
  supplier_id uuid not null,
  quotation_response_item_id uuid not null,

  allocated_quantity numeric(18,6) not null check (allocated_quantity > 0),
  estimated_pricing_quantity numeric(18,6),

  selected_price numeric(18,6) not null check (selected_price >= 0),
  benchmark_price_at_decision numeric(18,6),

  decision_reason text,
  decision_notes text,

  status text not null default 'draft'
    check (status in ('draft','confirmed','replaced','cancelled')),

  allocated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),

  check (estimated_pricing_quantity is null or estimated_pricing_quantity >= 0),
  check (benchmark_price_at_decision is null or benchmark_price_at_decision >= 0),

  foreign key (company_id, purchase_round_id)
    references public.purchase_rounds(company_id, id) on delete restrict,

  foreign key (company_id, quotation_item_id)
    references public.quotation_items(company_id, id) on delete restrict,

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict,

  foreign key (company_id, quotation_response_item_id)
    references public.quotation_response_items(company_id, id) on delete restrict
);

create index purchase_allocations_round_idx
on public.purchase_allocations(purchase_round_id);

create index purchase_allocations_item_idx
on public.purchase_allocations(quotation_item_id);

create index purchase_allocations_supplier_idx
on public.purchase_allocations(supplier_id);

create index purchase_allocations_item_status_idx
on public.purchase_allocations(quotation_item_id, status);

create trigger purchase_allocations_set_updated_at
before update on public.purchase_allocations
for each row execute function private.set_updated_at();

create or replace function private.validate_purchase_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  response_supplier_id uuid;
  response_item_id uuid;
  item_round_id uuid;
begin
  select rs.supplier_id, sqi.quotation_item_id
    into response_supplier_id, response_item_id
  from public.quotation_response_items qri
  join public.quotation_responses qr
    on qr.id = qri.quotation_response_id
   and qr.company_id = qri.company_id
  join public.round_suppliers rs
    on rs.id = qr.round_supplier_id
   and rs.company_id = qr.company_id
  join public.supplier_quotation_items sqi
    on sqi.id = qri.supplier_quotation_item_id
   and sqi.company_id = qri.company_id
  where qri.id = new.quotation_response_item_id
    and qri.company_id = new.company_id;

  select qi.purchase_round_id
    into item_round_id
  from public.quotation_items qi
  where qi.id = new.quotation_item_id
    and qi.company_id = new.company_id;

  if response_supplier_id is null
     or response_item_id is null
     or item_round_id is null
     or response_supplier_id <> new.supplier_id
     or response_item_id <> new.quotation_item_id
     or item_round_id <> new.purchase_round_id then
    raise exception 'Alocação inconsistente com fornecedor, resposta, item ou rodada';
  end if;

  return new;
end;
$$;

create trigger purchase_allocations_validate
before insert or update of
  company_id,
  purchase_round_id,
  quotation_item_id,
  supplier_id,
  quotation_response_item_id
on public.purchase_allocations
for each row execute function private.validate_purchase_allocation();

alter table public.purchase_allocations enable row level security;

revoke all on public.purchase_allocations from anon;
grant select, insert, update on public.purchase_allocations to authenticated;

create policy purchase_allocations_select_member
on public.purchase_allocations
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy purchase_allocations_insert_create
on public.purchase_allocations
for insert to authenticated
with check (
  status = 'draft'
  and (select private.has_permission(company_id, 'purchase_allocation.create'))
);

create policy purchase_allocations_update_draft
on public.purchase_allocations
for update to authenticated
using (
  status = 'draft'
  and (select private.has_permission(company_id, 'purchase_allocation.update'))
)
with check (
  status = 'draft'
  and (select private.has_permission(company_id, 'purchase_allocation.update'))
);

commit;
