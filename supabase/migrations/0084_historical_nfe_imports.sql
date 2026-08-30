-- Importação de NF-e antigas como histórico fiscal, sem fabricar pedidos,
-- cotações, divergências ou pendências operacionais retroativas.

begin;

create table public.historical_nfe_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'voided')),
  access_key text not null check (access_key ~ '^[0-9]{44}$'),
  invoice_number text not null,
  invoice_series text,
  issued_at timestamptz not null,
  issuer_document text,
  issuer_name text,
  recipient_document text,
  recipient_name text,
  invoice_total numeric(18,6) not null check (invoice_total >= 0),
  fiscal_totals jsonb not null check (jsonb_typeof(fiscal_totals) = 'object'),
  file_name text not null,
  storage_path text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 4194304),
  uploaded_by uuid references auth.users(id) on delete set null,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, access_key),
  foreign key (company_id) references public.companies(id) on delete restrict,
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete restrict
);

create index historical_nfe_imports_company_status_idx
on public.historical_nfe_imports(company_id, status, issued_at desc);

create index historical_nfe_imports_supplier_idx
on public.historical_nfe_imports(company_id, supplier_id, issued_at desc);

create trigger historical_nfe_imports_set_updated_at
before update on public.historical_nfe_imports
for each row execute function private.set_updated_at();

create table public.historical_nfe_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  import_id uuid not null,
  product_id uuid,
  line_number text not null,
  supplier_code text,
  barcode text,
  tributary_barcode text,
  description text not null,
  commercial_unit text,
  commercial_quantity numeric(18,6) not null check (commercial_quantity >= 0),
  commercial_unit_price numeric(18,6) not null check (commercial_unit_price >= 0),
  tributary_unit text,
  tributary_quantity numeric(18,6) not null check (tributary_quantity >= 0),
  tributary_unit_price numeric(18,6) not null check (tributary_unit_price >= 0),
  product_total numeric(18,6) not null check (product_total >= 0),
  item_discount numeric(18,6) not null default 0 check (item_discount >= 0),
  item_freight numeric(18,6) not null default 0 check (item_freight >= 0),
  item_insurance numeric(18,6) not null default 0 check (item_insurance >= 0),
  item_other numeric(18,6) not null default 0 check (item_other >= 0),
  net_product_total numeric(18,6) not null check (net_product_total >= 0),
  pricing_quantity numeric(18,6),
  practiced_price numeric(18,6),
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending', 'matched', 'ignored')),
  match_method text,
  match_confidence numeric(5,4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, import_id, line_number),
  foreign key (company_id, import_id)
    references public.historical_nfe_imports(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,
  check (
    (reconciliation_status = 'pending')
    or (reconciliation_status = 'ignored' and product_id is null)
    or (
      reconciliation_status = 'matched'
      and product_id is not null
      and pricing_quantity > 0
      and practiced_price >= 0
    )
  )
);

create index historical_nfe_items_import_idx
on public.historical_nfe_items(company_id, import_id);

create index historical_nfe_items_product_idx
on public.historical_nfe_items(company_id, product_id);

create trigger historical_nfe_items_set_updated_at
before update on public.historical_nfe_items
for each row execute function private.set_updated_at();

alter table public.historical_nfe_imports enable row level security;
alter table public.historical_nfe_items enable row level security;

revoke all on public.historical_nfe_imports from anon;
revoke all on public.historical_nfe_items from anon;
grant select on public.historical_nfe_imports to authenticated;
grant select on public.historical_nfe_items to authenticated;

create policy historical_nfe_imports_select_member
on public.historical_nfe_imports for select to authenticated
using ((select private.is_company_member(company_id)));

create policy historical_nfe_items_select_member
on public.historical_nfe_items for select to authenticated
using ((select private.is_company_member(company_id)));

create or replace function private.prevent_historical_nfe_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.company_id::text || ':' || new.access_key, 0)
  );
  if exists (
    select 1 from public.historical_nfe_imports history
    where history.company_id = new.company_id
      and history.access_key = new.access_key
  ) then
    raise exception 'Esta NF-e já foi importada no histórico fiscal';
  end if;
  return new;
end;
$$;

create trigger receipt_documents_prevent_historical_duplicate
before insert on public.receipt_documents
for each row execute function private.prevent_historical_nfe_duplicate();

create or replace function public.rpc_create_historical_nfe_import(
  p_company_id uuid,
  p_import_id uuid,
  p_supplier_id uuid,
  p_access_key text,
  p_invoice_number text,
  p_invoice_series text,
  p_issued_at timestamptz,
  p_issuer_document text,
  p_issuer_name text,
  p_recipient_document text,
  p_recipient_name text,
  p_invoice_total numeric,
  p_fiscal_totals jsonb,
  p_file_name text,
  p_storage_path text,
  p_file_size bigint,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_item jsonb;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if p_access_key is null or p_access_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso da NF-e inválida';
  end if;
  if p_issued_at is null or p_issued_at > now() + interval '1 day' then
    raise exception 'Data de emissão da NF-e inválida';
  end if;
  if p_storage_path <> (
    p_company_id::text || '/' || p_import_id::text || '/' || p_access_key || '.xml'
  ) then
    raise exception 'Caminho de armazenamento da NF-e inválido';
  end if;
  if exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.document_number is not null
      and nullif(pg_catalog.regexp_replace(coalesce(p_recipient_document, ''), '\D', '', 'g'), '') is not null
      and pg_catalog.regexp_replace(c.document_number, '\D', '', 'g')
        <> pg_catalog.regexp_replace(p_recipient_document, '\D', '', 'g')
  ) then
    raise exception 'O destinatário da NF-e é diferente da empresa atual';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A NF-e não possui produtos';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s
    where s.company_id = p_company_id and s.id = p_supplier_id
  ) then
    raise exception 'Fornecedor não pertence à empresa';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || p_access_key, 0)
  );
  if exists (
    select 1 from public.receipt_documents d
    where d.company_id = p_company_id and d.access_key = p_access_key
  ) then
    raise exception 'Esta NF-e já está vinculada a um recebimento';
  end if;

  insert into public.historical_nfe_imports (
    id, company_id, supplier_id, access_key, invoice_number, invoice_series,
    issued_at, issuer_document, issuer_name, recipient_document,
    recipient_name, invoice_total, fiscal_totals, file_name, storage_path,
    file_size, uploaded_by
  ) values (
    p_import_id, p_company_id, p_supplier_id, p_access_key, p_invoice_number,
    nullif(pg_catalog.btrim(p_invoice_series), ''), p_issued_at,
    nullif(pg_catalog.btrim(p_issuer_document), ''),
    nullif(pg_catalog.btrim(p_issuer_name), ''),
    nullif(pg_catalog.btrim(p_recipient_document), ''),
    nullif(pg_catalog.btrim(p_recipient_name), ''), p_invoice_total,
    p_fiscal_totals, p_file_name, p_storage_path, p_file_size, auth.uid()
  ) returning id into v_import_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.historical_nfe_items (
      company_id, import_id, product_id, line_number, supplier_code, barcode,
      tributary_barcode, description, commercial_unit, commercial_quantity,
      commercial_unit_price, tributary_unit, tributary_quantity,
      tributary_unit_price, product_total, item_discount, item_freight,
      item_insurance, item_other, net_product_total, pricing_quantity,
      practiced_price, reconciliation_status, match_method, match_confidence
    ) values (
      p_company_id, v_import_id, nullif(v_item ->> 'product_id', '')::uuid,
      v_item ->> 'line_number', nullif(v_item ->> 'supplier_code', ''),
      nullif(v_item ->> 'barcode', ''),
      nullif(v_item ->> 'tributary_barcode', ''), v_item ->> 'description',
      nullif(v_item ->> 'commercial_unit', ''),
      coalesce((v_item ->> 'commercial_quantity')::numeric, 0),
      coalesce((v_item ->> 'commercial_unit_price')::numeric, 0),
      nullif(v_item ->> 'tributary_unit', ''),
      coalesce((v_item ->> 'tributary_quantity')::numeric, 0),
      coalesce((v_item ->> 'tributary_unit_price')::numeric, 0),
      coalesce((v_item ->> 'product_total')::numeric, 0),
      coalesce((v_item ->> 'item_discount')::numeric, 0),
      coalesce((v_item ->> 'item_freight')::numeric, 0),
      coalesce((v_item ->> 'item_insurance')::numeric, 0),
      coalesce((v_item ->> 'item_other')::numeric, 0),
      coalesce((v_item ->> 'net_product_total')::numeric, 0),
      nullif(v_item ->> 'pricing_quantity', '')::numeric,
      nullif(v_item ->> 'practiced_price', '')::numeric,
      case when nullif(v_item ->> 'product_id', '') is not null
        and nullif(v_item ->> 'pricing_quantity', '') is not null
        and nullif(v_item ->> 'practiced_price', '') is not null
        then 'matched' else 'pending' end,
      nullif(v_item ->> 'match_method', ''),
      nullif(v_item ->> 'match_confidence', '')::numeric
    );
  end loop;

  return v_import_id;
end;
$$;

create or replace function public.rpc_discard_historical_nfe_import(
  p_company_id uuid,
  p_import_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform private.require_permission(p_company_id, 'receipt.post');
  delete from public.historical_nfe_imports
  where company_id = p_company_id and id = p_import_id and status = 'draft';
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.rpc_post_historical_nfe_import(
  p_company_id uuid,
  p_import_id uuid,
  p_supplier_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_item record;
  v_product_id uuid;
  v_alias_id uuid;
  v_name text;
  v_code text;
  v_normalized_name text;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if not exists (
    select 1 from public.suppliers s
    where s.company_id = p_company_id and s.id = p_supplier_id
  ) then
    raise exception 'Escolha um fornecedor válido';
  end if;
  if exists (
    select 1
    from public.historical_nfe_imports history
    join public.suppliers supplier
      on supplier.company_id = history.company_id and supplier.id = p_supplier_id
    where history.company_id = p_company_id and history.id = p_import_id
      and history.issuer_document is not null
      and supplier.document_number is not null
      and pg_catalog.left(
        pg_catalog.regexp_replace(history.issuer_document, '\D', '', 'g'), 8
      ) <> pg_catalog.left(
        pg_catalog.regexp_replace(supplier.document_number, '\D', '', 'g'), 8
      )
  ) then
    raise exception 'O CNPJ do fornecedor é diferente do emitente da NF-e';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Conciliação de produtos inválida';
  end if;

  perform 1 from public.historical_nfe_imports i
  where i.company_id = p_company_id and i.id = p_import_id
    and i.status = 'draft'
  for update;
  if not found then raise exception 'Importação não encontrada ou já concluída'; end if;

  if jsonb_array_length(p_items) <> (
    select count(*) from public.historical_nfe_items item
    where item.company_id = p_company_id and item.import_id = p_import_id
  ) then
    raise exception 'Todos os itens precisam ser revisados';
  end if;
  if (
    select count(distinct entry.value ->> 'id')
    from jsonb_array_elements(p_items) entry
  ) <> jsonb_array_length(p_items) then
    raise exception 'A conciliação contém itens repetidos';
  end if;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    if coalesce((v_entry ->> 'ignored')::boolean, false) then
      update public.historical_nfe_items
      set product_id = null, pricing_quantity = null, practiced_price = null,
          reconciliation_status = 'ignored',
          notes = nullif(pg_catalog.btrim(v_entry ->> 'notes'), '')
      where company_id = p_company_id and import_id = p_import_id
        and id = (v_entry ->> 'id')::uuid;
    else
      v_product_id := nullif(v_entry ->> 'product_id', '')::uuid;
      if v_product_id is null or not exists (
        select 1 from public.products p
        where p.company_id = p_company_id and p.id = v_product_id
      ) then
        raise exception 'Há item sem produto associado';
      end if;
      if nullif(v_entry ->> 'pricing_quantity', '') is null
         or nullif(v_entry ->> 'practiced_price', '') is null
         or nullif(v_entry ->> 'pricing_quantity', '')::numeric <= 0
         or nullif(v_entry ->> 'practiced_price', '')::numeric < 0 then
        raise exception 'Há quantidade ou preço inválido na conciliação';
      end if;
      update public.historical_nfe_items
      set product_id = v_product_id,
          pricing_quantity = (v_entry ->> 'pricing_quantity')::numeric,
          practiced_price = (v_entry ->> 'practiced_price')::numeric,
          reconciliation_status = 'matched',
          match_method = case when product_id = v_product_id
            then match_method else 'manual' end,
          match_confidence = case when product_id = v_product_id
            then match_confidence else 1 end,
          notes = nullif(pg_catalog.btrim(v_entry ->> 'notes'), '')
      where company_id = p_company_id and import_id = p_import_id
        and id = (v_entry ->> 'id')::uuid;
    end if;
    if not found then raise exception 'Item da conciliação não encontrado'; end if;
  end loop;

  for v_item in
    select item.* from public.historical_nfe_items item
    where item.company_id = p_company_id and item.import_id = p_import_id
      and item.reconciliation_status = 'matched'
  loop
    insert into public.supplier_products (
      company_id, supplier_id, product_id, status, source
    ) values (
      p_company_id, p_supplier_id, v_item.product_id, 'confirmed', 'purchase'
    ) on conflict (company_id, supplier_id, product_id) do update
      set status = 'confirmed', source = 'purchase', updated_at = now();

    v_alias_id := null;
    v_name := pg_catalog.btrim(v_item.description);
    v_code := nullif(pg_catalog.btrim(v_item.supplier_code), '');
    v_normalized_name := pg_catalog.lower(pg_catalog.btrim(
      pg_catalog.regexp_replace(v_name, '[[:space:]]+', ' ', 'g')
    ));
    if v_code is not null then
      select a.id into v_alias_id from public.supplier_product_aliases a
      where a.company_id = p_company_id and a.supplier_id = p_supplier_id
        and a.supplier_code = v_code for update;
    end if;
    if v_alias_id is null then
      select a.id into v_alias_id from public.supplier_product_aliases a
      where a.company_id = p_company_id and a.supplier_id = p_supplier_id
        and a.normalized_name = v_normalized_name for update;
    end if;
    if v_alias_id is null then
      insert into public.supplier_product_aliases (
        company_id, supplier_id, product_id, supplier_code, supplier_name,
        barcode, source, created_by
      ) values (
        p_company_id, p_supplier_id, v_item.product_id, v_code, v_name,
        coalesce(v_item.barcode, v_item.tributary_barcode), 'nfe', auth.uid()
      );
    else
      update public.supplier_product_aliases
      set product_id = v_item.product_id,
          barcode = coalesce(v_item.barcode, v_item.tributary_barcode, barcode),
          last_seen_at = now(), source = 'nfe'
      where company_id = p_company_id and id = v_alias_id;
    end if;
  end loop;

  update public.historical_nfe_imports
  set supplier_id = p_supplier_id, status = 'posted', posted_by = auth.uid(),
      posted_at = now()
  where company_id = p_company_id and id = p_import_id;
end;
$$;

revoke all on function public.rpc_create_historical_nfe_import(
  uuid, uuid, uuid, text, text, text, timestamptz, text, text, text, text,
  numeric, jsonb, text, text, bigint, jsonb
) from public, anon;
grant execute on function public.rpc_create_historical_nfe_import(
  uuid, uuid, uuid, text, text, text, timestamptz, text, text, text, text,
  numeric, jsonb, text, text, bigint, jsonb
) to authenticated;

revoke all on function public.rpc_discard_historical_nfe_import(uuid, uuid)
from public, anon;
grant execute on function public.rpc_discard_historical_nfe_import(uuid, uuid)
to authenticated;

revoke all on function public.rpc_post_historical_nfe_import(
  uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.rpc_post_historical_nfe_import(
  uuid, uuid, uuid, jsonb
) to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'historical-nfe-documents', 'historical-nfe-documents', false, 4194304,
  array['application/xml', 'text/xml']::text[]
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy historical_nfe_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'historical-nfe-documents'
  and (select private.is_company_member(((storage.foldername(name))[1])::uuid))
);

create policy historical_nfe_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'historical-nfe-documents'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid, 'receipt.post'
  ))
  and exists (
    select 1 from public.historical_nfe_imports i
    where i.company_id = ((storage.foldername(name))[1])::uuid
      and i.id = ((storage.foldername(name))[2])::uuid
      and i.status = 'draft'
  )
);

create policy historical_nfe_storage_delete_draft
on storage.objects for delete to authenticated
using (
  bucket_id = 'historical-nfe-documents'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid, 'receipt.post'
  ))
  and exists (
    select 1 from public.historical_nfe_imports i
    where i.company_id = ((storage.foldername(name))[1])::uuid
      and i.id = ((storage.foldername(name))[2])::uuid
      and i.status = 'draft'
  )
);

create or replace view public.v_purchase_price_history
with (security_invoker = true)
as
select
  ri.company_id,
  ri.id as event_id,
  'receipt'::text as source,
  ori.product_id,
  p.name as product_name,
  o.supplier_id,
  s.name as supplier_name,
  r.received_at as occurred_at,
  ri.pricing_quantity_received as pricing_quantity,
  ri.practiced_price,
  u.symbol as pricing_unit_symbol,
  r.invoice_number,
  r.invoice_series,
  doc.access_key,
  r.id as receipt_id,
  null::uuid as historical_import_id
from public.receipt_items ri
join public.receipts r
  on r.company_id = ri.company_id and r.id = ri.receipt_id and r.status = 'posted'
join public.orders o
  on o.company_id = r.company_id and o.id = r.order_id
join public.suppliers s
  on s.company_id = o.company_id and s.id = o.supplier_id
join public.order_revision_items ori
  on ori.company_id = ri.company_id and ori.id = ri.order_revision_item_id
join public.products p
  on p.company_id = ori.company_id and p.id = ori.product_id
join public.units u
  on u.company_id = ori.company_id and u.id = ori.pricing_unit_id
left join lateral (
  select d.access_key from public.receipt_documents d
  where d.company_id = r.company_id and d.receipt_id = r.id
  order by d.created_at desc limit 1
) doc on true
union all
select
  item.company_id,
  item.id,
  'historical_nfe'::text,
  item.product_id,
  p.name,
  history.supplier_id,
  s.name,
  history.issued_at,
  item.pricing_quantity,
  item.practiced_price,
  u.symbol,
  history.invoice_number,
  history.invoice_series,
  history.access_key,
  null::uuid,
  history.id
from public.historical_nfe_items item
join public.historical_nfe_imports history
  on history.company_id = item.company_id and history.id = item.import_id
  and history.status = 'posted'
join public.products p
  on p.company_id = item.company_id and p.id = item.product_id
join public.units u
  on u.company_id = p.company_id and u.id = p.pricing_unit_id
join public.suppliers s
  on s.company_id = history.company_id and s.id = history.supplier_id
where item.reconciliation_status = 'matched';

grant select on public.v_purchase_price_history to authenticated;

commit;
