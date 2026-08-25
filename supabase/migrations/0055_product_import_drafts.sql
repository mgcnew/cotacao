-- 0055_product_import_drafts.sql
-- Lotes persistentes para revisar planilhas antes de criar produtos reais.

begin;

create table public.product_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 240),
  sheet_name text check (sheet_name is null or char_length(sheet_name) <= 120),
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows between 0 and 5000),
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index product_import_batches_company_time_idx
on public.product_import_batches(company_id, created_at desc);

create trigger product_import_batches_set_updated_at
before update on public.product_import_batches
for each row execute function private.set_updated_at();

create table public.product_import_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  batch_id uuid not null,
  source_category text not null check (char_length(btrim(source_category)) between 1 and 160),
  category_id uuid,
  purchase_unit_id uuid,
  pricing_unit_id uuid,
  comparison_unit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (batch_id, source_category),
  foreign key (company_id, batch_id)
    references public.product_import_batches(company_id, id) on delete cascade,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete restrict,
  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, pricing_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, comparison_unit_id)
    references public.units(company_id, id) on delete restrict
);

create index product_import_mappings_batch_idx
on public.product_import_mappings(batch_id, source_category);

create trigger product_import_mappings_set_updated_at
before update on public.product_import_mappings
for each row execute function private.set_updated_at();

create table public.product_import_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  batch_id uuid not null,
  source_row integer not null check (source_row > 1),
  source_code text check (source_code is null or char_length(source_code) <= 120),
  raw_name text not null check (char_length(btrim(raw_name)) between 1 and 500),
  raw_barcode text check (raw_barcode is null or char_length(raw_barcode) <= 120),
  source_category text not null check (char_length(btrim(source_category)) between 1 and 160),
  proposed_name text not null check (char_length(btrim(proposed_name)) between 1 and 120),
  normalized_name text generated always as (
    lower(btrim(regexp_replace(proposed_name, '[[:space:]]+', ' ', 'g')))
  ) stored,
  barcode text check (barcode is null or char_length(barcode) between 3 and 64),
  category_id uuid,
  purpose text not null default 'resale'
    check (purpose in ('resale','internal','production','packaging','other')),
  purchase_unit_id uuid,
  pricing_unit_id uuid,
  comparison_unit_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'blocked', 'ignored', 'imported', 'error')),
  issues text[] not null default '{}',
  duplicate_product_id uuid,
  imported_product_id uuid,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (batch_id, source_row),
  foreign key (company_id, batch_id)
    references public.product_import_batches(company_id, id) on delete cascade,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete restrict,
  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, pricing_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, comparison_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, duplicate_product_id)
    references public.products(company_id, id) on delete restrict,
  foreign key (company_id, imported_product_id)
    references public.products(company_id, id) on delete restrict
);

create index product_import_items_batch_status_idx
on public.product_import_items(batch_id, status, source_row);

create index product_import_items_batch_category_idx
on public.product_import_items(batch_id, source_category, source_row);

create index product_import_items_company_name_idx
on public.product_import_items(company_id, normalized_name);

create trigger product_import_items_set_updated_at
before update on public.product_import_items
for each row execute function private.set_updated_at();

alter table public.product_import_batches enable row level security;
alter table public.product_import_mappings enable row level security;
alter table public.product_import_items enable row level security;

revoke all on public.product_import_batches from anon;
revoke all on public.product_import_mappings from anon;
revoke all on public.product_import_items from anon;

grant select, insert, update on public.product_import_batches to authenticated;
grant select, insert, update on public.product_import_mappings to authenticated;
grant select, insert, update on public.product_import_items to authenticated;

create policy product_import_batches_select
on public.product_import_batches for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy product_import_batches_insert
on public.product_import_batches for insert to authenticated
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_import_batches_update
on public.product_import_batches for update to authenticated
using ((select private.has_permission(company_id, 'product.create')))
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_import_mappings_select
on public.product_import_mappings for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy product_import_mappings_insert
on public.product_import_mappings for insert to authenticated
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_import_mappings_update
on public.product_import_mappings for update to authenticated
using ((select private.has_permission(company_id, 'product.create')))
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_import_items_select
on public.product_import_items for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy product_import_items_insert
on public.product_import_items for insert to authenticated
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_import_items_update
on public.product_import_items for update to authenticated
using ((select private.has_permission(company_id, 'product.create')))
with check ((select private.has_permission(company_id, 'product.create')));

create or replace function public.rpc_publish_product_import_items(
  p_company_id uuid,
  p_batch_id uuid,
  p_item_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item record;
  v_product_id uuid;
  v_count integer := 0;
  v_requested integer;
begin
  perform private.require_permission(p_company_id, 'product.create');

  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'Selecione ao menos um produto pronto.';
  end if;
  if cardinality(p_item_ids) > 100 then
    raise exception 'Publique no máximo 100 produtos por vez.';
  end if;

  perform 1
  from public.product_import_batches b
  where b.company_id = p_company_id
    and b.id = p_batch_id
    and b.status = 'draft'
  for update;
  if not found then
    raise exception 'Lote de importação não encontrado ou já encerrado.';
  end if;

  select count(distinct i.id)::integer
  into v_requested
  from public.product_import_items i
  where i.company_id = p_company_id
    and i.batch_id = p_batch_id
    and i.id = any(p_item_ids);
  if v_requested <> cardinality(p_item_ids) then
    raise exception 'A seleção contém itens inválidos.';
  end if;

  for v_item in
    select i.*
    from public.product_import_items i
    where i.company_id = p_company_id
      and i.batch_id = p_batch_id
      and i.id = any(p_item_ids)
    order by i.source_row
    for update
  loop
    if v_item.status <> 'ready'
       or cardinality(v_item.issues) > 0
       or v_item.category_id is null
       or v_item.purchase_unit_id is null
       or v_item.pricing_unit_id is null then
      raise exception 'A linha % ainda possui pendências.', v_item.source_row;
    end if;

    if exists (
      select 1 from public.products p
      where p.company_id = p_company_id
        and p.normalized_name = v_item.normalized_name
    ) then
      raise exception 'Já existe produto com o nome "%".', v_item.proposed_name;
    end if;
    if v_item.barcode is not null and exists (
      select 1 from public.product_barcodes pb
      where pb.company_id = p_company_id
        and pb.code = v_item.barcode
    ) then
      raise exception 'O código % já pertence a outro produto.', v_item.barcode;
    end if;

    insert into public.products (
      company_id, category_id, name, purpose,
      purchase_unit_id, pricing_unit_id, comparison_unit_id
    ) values (
      p_company_id, v_item.category_id, v_item.proposed_name, v_item.purpose,
      v_item.purchase_unit_id, v_item.pricing_unit_id, v_item.comparison_unit_id
    ) returning id into v_product_id;

    if v_item.barcode is not null then
      insert into public.product_barcodes (
        company_id, product_id, code, label, is_primary
      ) values (
        p_company_id, v_product_id, v_item.barcode, 'Importado da planilha', true
      );
    end if;

    update public.product_import_items
    set status = 'imported',
        imported_product_id = v_product_id,
        error_message = null
    where company_id = p_company_id
      and id = v_item.id;

    v_count := v_count + 1;
  end loop;

  if not exists (
    select 1 from public.product_import_items i
    where i.company_id = p_company_id
      and i.batch_id = p_batch_id
      and i.status not in ('imported', 'ignored')
  ) then
    update public.product_import_batches
    set status = 'completed', completed_at = now()
    where company_id = p_company_id and id = p_batch_id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
from public, anon;
grant execute on function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
to authenticated;

commit;
