-- 0008_quotations_negotiations.sql
-- Respostas, atributos informados, negociações e correções.

begin;

create table public.quotation_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  round_supplier_id uuid not null,
  source text not null
    check (source in ('supplier_link','manual')),
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','partial','completed')),
  entered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (round_supplier_id),

  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete cascade
);

create index quotation_responses_round_supplier_idx
on public.quotation_responses(round_supplier_id);
create index quotation_responses_company_status_idx
on public.quotation_responses(company_id, status);

create trigger quotation_responses_set_updated_at
before update on public.quotation_responses
for each row execute function private.set_updated_at();

create table public.quotation_response_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_response_id uuid not null,
  supplier_quotation_item_id uuid not null,
  quoted_price numeric(18,6),
  is_available boolean,
  does_not_supply boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (quotation_response_id, supplier_quotation_item_id),

  check (quoted_price is null or quoted_price >= 0),
  check (not (does_not_supply = true and is_available = true)),

  foreign key (company_id, quotation_response_id)
    references public.quotation_responses(company_id, id) on delete cascade,
  foreign key (company_id, supplier_quotation_item_id)
    references public.supplier_quotation_items(company_id, id) on delete restrict
);

create index quotation_response_items_response_idx
on public.quotation_response_items(quotation_response_id);
create index quotation_response_items_supplier_item_idx
on public.quotation_response_items(supplier_quotation_item_id);

create trigger quotation_response_items_set_updated_at
before update on public.quotation_response_items
for each row execute function private.set_updated_at();

create table public.quotation_response_attribute_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_response_item_id uuid not null,
  attribute_definition_id uuid not null,
  value_text text,
  value_numeric numeric(18,6),
  value_boolean boolean,
  created_at timestamptz not null default now(),
  unique (quotation_response_item_id, attribute_definition_id),
  check (num_nonnulls(value_text, value_numeric, value_boolean) = 1),

  foreign key (company_id, quotation_response_item_id)
    references public.quotation_response_items(company_id, id) on delete cascade,
  foreign key (company_id, attribute_definition_id)
    references public.product_attribute_definitions(company_id, id) on delete restrict
);

create index quotation_response_attribute_values_item_idx
on public.quotation_response_attribute_values(quotation_response_item_id);

create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_response_item_id uuid not null,
  previous_price numeric(18,6) not null check (previous_price >= 0),
  new_price numeric(18,6) not null check (new_price >= 0),
  channel text not null
    check (channel in ('phone','whatsapp','in_person','other')),
  notes text,
  negotiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),

  foreign key (company_id, quotation_response_item_id)
    references public.quotation_response_items(company_id, id) on delete restrict
);

create index negotiations_response_item_created_idx
on public.negotiations(quotation_response_item_id, created_at);

create table public.response_item_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_response_item_id uuid not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  reason text not null,
  corrected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),

  foreign key (company_id, quotation_response_item_id)
    references public.quotation_response_items(company_id, id) on delete restrict
);

create index response_item_corrections_item_idx
on public.response_item_corrections(quotation_response_item_id);


-- ============================================================
-- INTEGRIDADE DE DOMÍNIO
-- ============================================================

create or replace function private.validate_quotation_response_item_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  response_round_supplier uuid;
  item_round_supplier uuid;
begin
  select qr.round_supplier_id
    into response_round_supplier
  from public.quotation_responses qr
  where qr.id = new.quotation_response_id
    and qr.company_id = new.company_id;

  select sqi.round_supplier_id
    into item_round_supplier
  from public.supplier_quotation_items sqi
  where sqi.id = new.supplier_quotation_item_id
    and sqi.company_id = new.company_id;

  if response_round_supplier is null
     or item_round_supplier is null
     or response_round_supplier <> item_round_supplier then
    raise exception 'Resposta e item devem pertencer ao mesmo fornecedor da Rodada';
  end if;

  return new;
end;
$$;

create trigger quotation_response_items_validate_owner
before insert or update of company_id, quotation_response_id, supplier_quotation_item_id
on public.quotation_response_items
for each row execute function private.validate_quotation_response_item_owner();

alter table public.quotation_responses enable row level security;
alter table public.quotation_response_items enable row level security;
alter table public.quotation_response_attribute_values enable row level security;
alter table public.negotiations enable row level security;
alter table public.response_item_corrections enable row level security;

revoke all on public.quotation_responses from anon;
revoke all on public.quotation_response_items from anon;
revoke all on public.quotation_response_attribute_values from anon;
revoke all on public.negotiations from anon;
revoke all on public.response_item_corrections from anon;

grant select, insert, update on public.quotation_responses to authenticated;
grant select, insert, update on public.quotation_response_items to authenticated;
grant select, insert, update on public.quotation_response_attribute_values to authenticated;
grant select, insert on public.negotiations to authenticated;
grant select, insert on public.response_item_corrections to authenticated;

create policy quotation_responses_select_member on public.quotation_responses
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy quotation_responses_insert_manual on public.quotation_responses
for insert to authenticated
with check (
  source = 'manual'
  and (select private.has_permission(company_id, 'quotation_response.manual_create'))
);

create policy quotation_responses_update_manual on public.quotation_responses
for update to authenticated
using (
  source = 'manual'
  and (select private.has_permission(company_id, 'quotation_response.manual_create'))
)
with check (
  source = 'manual'
  and (select private.has_permission(company_id, 'quotation_response.manual_create'))
);

create policy quotation_response_items_select_member on public.quotation_response_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy quotation_response_items_insert_manual on public.quotation_response_items
for insert to authenticated
with check ((select private.has_permission(company_id, 'quotation_response.manual_create')));

create policy quotation_response_items_update_manual on public.quotation_response_items
for update to authenticated
using ((select private.has_permission(company_id, 'quotation_response.correct')))
with check ((select private.has_permission(company_id, 'quotation_response.correct')));

create policy quotation_response_attribute_values_select_member
on public.quotation_response_attribute_values
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy quotation_response_attribute_values_insert_manual
on public.quotation_response_attribute_values
for insert to authenticated
with check ((select private.has_permission(company_id, 'quotation_response.manual_create')));

create policy quotation_response_attribute_values_update_correct
on public.quotation_response_attribute_values
for update to authenticated
using ((select private.has_permission(company_id, 'quotation_response.correct')))
with check ((select private.has_permission(company_id, 'quotation_response.correct')));

create policy negotiations_select_member on public.negotiations
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy negotiations_insert_create on public.negotiations
for insert to authenticated
with check ((select private.has_permission(company_id, 'negotiation.create')));

create policy response_item_corrections_select_member on public.response_item_corrections
for select to authenticated
using ((select private.is_company_member(company_id)));

create policy response_item_corrections_insert_correct on public.response_item_corrections
for insert to authenticated
with check ((select private.has_permission(company_id, 'quotation_response.correct')));

commit;
