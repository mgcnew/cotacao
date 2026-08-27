-- 0068_detected_supplier_purchase_patterns.sql
-- Memoria das sugestoes de rotina recusadas. O padrao e calculado do historico
-- atual; esta tabela apenas evita insistir depois de uma decisao consciente.

begin;

create table public.supplier_purchase_pattern_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  dismissed_until date not null,
  detected_weekday smallint not null check (detected_weekday between 0 and 6),
  detected_interval_weeks smallint not null check (detected_interval_weeks in (1, 2, 4)),
  order_count integer not null check (order_count >= 3),
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, supplier_id),
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade
);

create index supplier_purchase_pattern_decisions_dismissed_idx
on public.supplier_purchase_pattern_decisions(company_id, dismissed_until);

create trigger supplier_purchase_pattern_decisions_set_updated_at
before update on public.supplier_purchase_pattern_decisions
for each row execute function private.set_updated_at();

alter table public.supplier_purchase_pattern_decisions enable row level security;
revoke all on public.supplier_purchase_pattern_decisions from anon;
grant select, insert, update on public.supplier_purchase_pattern_decisions to authenticated;

create policy supplier_purchase_pattern_decisions_select
on public.supplier_purchase_pattern_decisions for select to authenticated
using ((select private.has_permission(company_id, 'supplier.view')));

create policy supplier_purchase_pattern_decisions_insert
on public.supplier_purchase_pattern_decisions for insert to authenticated
with check ((select private.has_permission(company_id, 'supplier.update')));

create policy supplier_purchase_pattern_decisions_update
on public.supplier_purchase_pattern_decisions for update to authenticated
using ((select private.has_permission(company_id, 'supplier.update')))
with check ((select private.has_permission(company_id, 'supplier.update')));

commit;
