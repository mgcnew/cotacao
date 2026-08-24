-- 0042_shopping_lists_and_barcodes.sql
-- Códigos alternativos de produto e fila operacional de necessidades de compra.

begin;

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  code text not null check (char_length(btrim(code)) between 3 and 64),
  label text check (label is null or char_length(label) <= 120),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade
);

create unique index product_barcodes_primary_uidx
on public.product_barcodes(product_id)
where is_primary and is_active;

create index product_barcodes_product_idx
on public.product_barcodes(product_id);

create trigger product_barcodes_set_updated_at
before update on public.product_barcodes
for each row execute function private.set_updated_at();

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null default 'Lista atual'
    check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'open'
    check (status in ('open', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

-- A primeira versão tem uma fila aberta por empresa. O histórico fica nas
-- listas arquivadas e a estrutura já aceita listas nomeadas no futuro.
create unique index shopping_lists_one_open_uidx
on public.shopping_lists(company_id)
where status = 'open';

create trigger shopping_lists_set_updated_at
before update on public.shopping_lists
for each row execute function private.set_updated_at();

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  shopping_list_id uuid not null,
  product_id uuid not null,
  requested_quantity numeric(18,6) not null
    check (requested_quantity > 0),
  purchase_unit_id uuid not null,
  notes text check (notes is null or char_length(notes) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'removed')),
  added_by uuid references auth.users(id) on delete set null,
  imported_to_type text
    check (imported_to_type is null or imported_to_type in ('quotation', 'order')),
  imported_to_id uuid,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, shopping_list_id)
    references public.shopping_lists(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,
  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,
  check (
    (status = 'imported' and imported_to_type is not null
      and imported_to_id is not null and imported_at is not null)
    or
    (status <> 'imported' and imported_to_type is null
      and imported_to_id is null and imported_at is null)
  )
);

create unique index shopping_list_items_pending_product_uidx
on public.shopping_list_items(shopping_list_id, product_id)
where status = 'pending';

create index shopping_list_items_company_status_idx
on public.shopping_list_items(company_id, status, created_at desc);

create trigger shopping_list_items_set_updated_at
before update on public.shopping_list_items
for each row execute function private.set_updated_at();

alter table public.product_barcodes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

revoke all on public.product_barcodes from anon;
revoke all on public.shopping_lists from anon;
revoke all on public.shopping_list_items from anon;

grant select, insert, update on public.product_barcodes to authenticated;
grant select, insert, update on public.shopping_lists to authenticated;
grant select, insert, update on public.shopping_list_items to authenticated;

create policy product_barcodes_select
on public.product_barcodes for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy product_barcodes_insert
on public.product_barcodes for insert to authenticated
with check ((select private.has_permission(company_id, 'product.create')));

create policy product_barcodes_update
on public.product_barcodes for update to authenticated
using ((select private.has_permission(company_id, 'product.update')))
with check ((select private.has_permission(company_id, 'product.update')));

create policy shopping_lists_select
on public.shopping_lists for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy shopping_lists_insert
on public.shopping_lists for insert to authenticated
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

create policy shopping_lists_update
on public.shopping_lists for update to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

create policy shopping_list_items_select
on public.shopping_list_items for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy shopping_list_items_insert
on public.shopping_list_items for insert to authenticated
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

create policy shopping_list_items_update
on public.shopping_list_items for update to authenticated
using (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
)
with check (
  (select private.has_permission(company_id, 'product.update'))
  or (select private.has_permission(company_id, 'purchase_round.create'))
  or (select private.has_permission(company_id, 'order.create'))
);

-- Importa uma seleção na rodada e consome a lista na mesma transação. Se o
-- produto já estiver aberto na rodada, soma a necessidade em vez de duplicar.
create or replace function public.rpc_import_shopping_items_to_round(
  p_company_id uuid,
  p_round_id uuid,
  p_group_id uuid,
  p_shopping_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_group_id uuid;
  v_quotation_item_id uuid;
  v_count integer := 0;
begin
  perform private.require_permission(p_company_id, 'purchase_round.update');

  if not exists (
    select 1 from public.purchase_rounds pr
    where pr.id = p_round_id and pr.company_id = p_company_id
      and pr.status = 'draft'
  ) then
    raise exception 'Rodada inválida ou fora de preparação';
  end if;

  select g.id into v_group_id
  from public.purchase_round_groups g
  where g.company_id = p_company_id
    and g.purchase_round_id = p_round_id
    and (p_group_id is null or g.id = p_group_id)
  order by g.sort_order, g.created_at
  limit 1;

  if v_group_id is null then
    raise exception 'Grupo inválido para esta rodada';
  end if;

  for v_row in
    select sli.id, sli.product_id, sli.requested_quantity, sli.notes,
           p.purchase_unit_id, p.pricing_unit_id, p.comparison_unit_id
    from public.shopping_list_items sli
    join public.shopping_lists sl
      on sl.id = sli.shopping_list_id and sl.company_id = sli.company_id
    join public.products p
      on p.id = sli.product_id and p.company_id = sli.company_id
    where sli.company_id = p_company_id
      and sli.id = any(p_shopping_item_ids)
      and sli.status = 'pending' and sl.status = 'open' and p.is_active
    order by sli.created_at
  loop
    select qi.id into v_quotation_item_id
    from public.quotation_items qi
    where qi.company_id = p_company_id
      and qi.purchase_round_id = p_round_id
      and qi.product_id = v_row.product_id
      and qi.commercial_status = 'open'
    order by qi.created_at
    limit 1;

    if v_quotation_item_id is null then
      insert into public.quotation_items (
        company_id, purchase_round_id, group_id, product_id,
        requested_quantity, purchase_unit_id, pricing_unit_id,
        comparison_unit_id, notes
      ) values (
        p_company_id, p_round_id, v_group_id, v_row.product_id,
        v_row.requested_quantity, v_row.purchase_unit_id,
        v_row.pricing_unit_id, v_row.comparison_unit_id, v_row.notes
      ) returning id into v_quotation_item_id;

      insert into public.supplier_quotation_items (
        company_id, round_supplier_id, quotation_item_id,
        added_after_initial_send
      )
      select p_company_id, rsg.round_supplier_id, v_quotation_item_id,
             (rs.first_sent_at is not null)
      from public.round_supplier_groups rsg
      join public.round_suppliers rs
        on rs.id = rsg.round_supplier_id and rs.company_id = rsg.company_id
      where rsg.company_id = p_company_id
        and rsg.group_id = v_group_id and rsg.removed_at is null
      on conflict (round_supplier_id, quotation_item_id) do nothing;
    else
      update public.quotation_items
      set requested_quantity = requested_quantity + v_row.requested_quantity
      where id = v_quotation_item_id and company_id = p_company_id;
    end if;

    update public.shopping_list_items
    set status = 'imported', imported_to_type = 'quotation',
        imported_to_id = p_round_id, imported_at = now()
    where id = v_row.id and company_id = p_company_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- O pedido e o consumo da lista também ficam atômicos: a RPC existente cria
-- o pedido; qualquer falha posterior desfaz a transação inteira.
create or replace function public.rpc_create_direct_order_from_shopping_list(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_shopping_item_ids uuid[],
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  v_result := public.rpc_create_direct_order(
    p_company_id, p_supplier_id, p_items, p_delivery_due_date
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  update public.shopping_list_items sli
  set status = 'imported', imported_to_type = 'order',
      imported_to_id = v_order_id, imported_at = now()
  where sli.company_id = p_company_id
    and sli.id = any(p_shopping_item_ids)
    and sli.status = 'pending'
    and exists (
      select 1 from jsonb_array_elements(p_items) item
      where (item ->> 'product_id')::uuid = sli.product_id
    );

  return v_result;
end;
$$;

revoke all on function public.rpc_import_shopping_items_to_round(uuid, uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.rpc_import_shopping_items_to_round(uuid, uuid, uuid, uuid[])
  to authenticated;

revoke all on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  from public, anon;
grant execute on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  to authenticated;

commit;
