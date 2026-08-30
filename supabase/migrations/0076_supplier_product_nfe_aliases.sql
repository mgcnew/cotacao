-- Aprende como cada fornecedor descreve/codifica os produtos na NF-e.

begin;

create table public.supplier_product_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  product_id uuid not null,
  supplier_code text
    check (supplier_code is null or char_length(btrim(supplier_code)) between 1 and 120),
  supplier_name text not null
    check (char_length(btrim(supplier_name)) between 1 and 500),
  normalized_name text generated always as (
    lower(btrim(regexp_replace(supplier_name, '[[:space:]]+', ' ', 'g')))
  ) stored,
  barcode text
    check (barcode is null or char_length(btrim(barcode)) between 3 and 64),
  source text not null default 'nfe'
    check (source in ('nfe','manual')),
  created_by uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, supplier_id, normalized_name),

  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade
);

create unique index supplier_product_aliases_code_uidx
on public.supplier_product_aliases(company_id, supplier_id, supplier_code)
where supplier_code is not null;

create index supplier_product_aliases_product_idx
on public.supplier_product_aliases(company_id, product_id);

create trigger supplier_product_aliases_set_updated_at
before update on public.supplier_product_aliases
for each row execute function private.set_updated_at();

alter table public.supplier_product_aliases enable row level security;
revoke all on public.supplier_product_aliases from anon;
grant select on public.supplier_product_aliases to authenticated;

create policy supplier_product_aliases_select_member
on public.supplier_product_aliases for select to authenticated
using ((select private.is_company_member(company_id)));

create or replace function public.rpc_learn_supplier_product_alias(
  p_company_id uuid,
  p_receipt_id uuid,
  p_order_revision_item_id uuid,
  p_supplier_name text,
  p_supplier_code text default null,
  p_barcode text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_revision_id uuid;
  v_product_id uuid;
  v_alias_id uuid;
  v_name text := nullif(pg_catalog.btrim(p_supplier_name), '');
  v_code text := nullif(pg_catalog.btrim(p_supplier_code), '');
  v_barcode text := nullif(pg_catalog.btrim(p_barcode), '');
  v_normalized_name text;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if v_name is null or char_length(v_name) > 500 then
    raise exception 'Descrição do produto na NF-e inválida';
  end if;
  if v_code is not null and char_length(v_code) > 120 then
    raise exception 'Código do fornecedor inválido';
  end if;
  if v_barcode is not null and char_length(v_barcode) not between 3 and 64 then
    raise exception 'Código de barras inválido';
  end if;

  select o.supplier_id, o.current_revision_id
  into v_supplier_id, v_revision_id
  from public.receipts r
  join public.orders o
    on o.company_id = r.company_id and o.id = r.order_id
  where r.company_id = p_company_id
    and r.id = p_receipt_id
    and r.status = 'draft'
  for update of r;

  if v_supplier_id is null or v_revision_id is null then
    raise exception 'Recebimento não encontrado ou já conferido';
  end if;

  select ori.product_id
  into v_product_id
  from public.order_revision_items ori
  where ori.company_id = p_company_id
    and ori.order_revision_id = v_revision_id
    and ori.id = p_order_revision_item_id;

  if v_product_id is null then
    raise exception 'Produto não pertence ao pedido deste recebimento';
  end if;

  insert into public.supplier_products (
    company_id, supplier_id, product_id, status, source
  ) values (
    p_company_id, v_supplier_id, v_product_id, 'confirmed', 'purchase'
  )
  on conflict (company_id, supplier_id, product_id) do update
  set status = 'confirmed', source = 'purchase', updated_at = now();

  v_normalized_name := pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(v_name, '[[:space:]]+', ' ', 'g')
    )
  );

  if v_code is not null then
    select a.id into v_alias_id
    from public.supplier_product_aliases a
    where a.company_id = p_company_id
      and a.supplier_id = v_supplier_id
      and a.supplier_code = v_code
    for update;
  end if;

  if v_alias_id is null then
    select a.id into v_alias_id
    from public.supplier_product_aliases a
    where a.company_id = p_company_id
      and a.supplier_id = v_supplier_id
      and a.normalized_name = v_normalized_name
    for update;
  end if;

  if v_alias_id is null then
    insert into public.supplier_product_aliases (
      company_id, supplier_id, product_id, supplier_code,
      supplier_name, barcode, source, created_by
    ) values (
      p_company_id, v_supplier_id, v_product_id, v_code,
      v_name, v_barcode, 'nfe', auth.uid()
    ) returning id into v_alias_id;
  else
    update public.supplier_product_aliases
    set product_id = v_product_id,
        supplier_code = coalesce(v_code, supplier_code),
        supplier_name = v_name,
        barcode = coalesce(v_barcode, barcode),
        source = 'nfe',
        last_seen_at = now()
    where company_id = p_company_id and id = v_alias_id;
  end if;

  return v_alias_id;
end;
$$;

revoke all on function public.rpc_learn_supplier_product_alias(
  uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.rpc_learn_supplier_product_alias(
  uuid, uuid, uuid, text, text, text
) to authenticated;

commit;
