-- Separa o fornecedor comercial (quem recebe a cotação) das empresas que
-- efetivamente emitem NF-e. Um mesmo recebimento pode guardar várias notas e
-- cada item conferido mantém a origem fiscal correta.

begin;

create table public.supplier_legal_entities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  document_number text not null
    check (document_number ~ '^[0-9]{14}$'),
  legal_name text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  source text not null default 'nfe'
    check (source in ('supplier_registration', 'nfe', 'manual')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, document_number),
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade
);

create unique index supplier_legal_entities_one_primary_idx
on public.supplier_legal_entities(company_id, supplier_id)
where is_primary;

create index supplier_legal_entities_supplier_idx
on public.supplier_legal_entities(company_id, supplier_id, is_active);

create trigger supplier_legal_entities_set_updated_at
before update on public.supplier_legal_entities
for each row execute function private.set_updated_at();

alter table public.supplier_legal_entities enable row level security;
revoke all on public.supplier_legal_entities from anon;
grant select on public.supplier_legal_entities to authenticated;

create policy supplier_legal_entities_select_member
on public.supplier_legal_entities for select to authenticated
using ((select private.is_company_member(company_id)));

create or replace function private.sync_supplier_primary_legal_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_number text := pg_catalog.regexp_replace(
    coalesce(new.document_number, ''), '\D', '', 'g'
  );
  v_entity_id uuid;
begin
  if v_document_number !~ '^[0-9]{14}$' then
    update public.supplier_legal_entities
    set is_primary = false
    where company_id = new.company_id
      and supplier_id = new.id
      and is_primary;
    return new;
  end if;

  select entity.id into v_entity_id
  from public.supplier_legal_entities entity
  where entity.company_id = new.company_id
    and entity.document_number = v_document_number;

  if v_entity_id is null then
    insert into public.supplier_legal_entities (
      company_id, supplier_id, document_number, legal_name,
      is_primary, source, created_by
    ) values (
      new.company_id, new.id, v_document_number, new.legal_name,
      false, 'supplier_registration', auth.uid()
    ) returning id into v_entity_id;
  elsif not exists (
    select 1 from public.supplier_legal_entities entity
    where entity.company_id = new.company_id
      and entity.id = v_entity_id
      and entity.supplier_id = new.id
  ) then
    raise exception 'Este CNPJ já pertence a outro fornecedor';
  end if;

  update public.supplier_legal_entities
  set is_primary = false
  where company_id = new.company_id
    and supplier_id = new.id
    and id <> v_entity_id
    and is_primary;

  update public.supplier_legal_entities
  set is_primary = true,
      is_active = true,
      legal_name = coalesce(nullif(new.legal_name, ''), legal_name),
      updated_at = now()
  where company_id = new.company_id and id = v_entity_id;

  return new;
end;
$$;

-- O CNPJ que já existe no cadastro continua sendo a empresa principal.
insert into public.supplier_legal_entities (
  company_id, supplier_id, document_number, legal_name, is_primary, source
)
select
  supplier.company_id,
  supplier.id,
  pg_catalog.regexp_replace(supplier.document_number, '\D', '', 'g'),
  supplier.legal_name,
  true,
  'supplier_registration'
from public.suppliers supplier
where pg_catalog.regexp_replace(
  coalesce(supplier.document_number, ''), '\D', '', 'g'
) ~ '^[0-9]{14}$'
on conflict (company_id, document_number) do nothing;

create trigger suppliers_sync_primary_legal_entity
after insert or update of document_number, legal_name on public.suppliers
for each row execute function private.sync_supplier_primary_legal_entity();

alter table public.receipt_documents
  add column supplier_legal_entity_id uuid,
  add column issuer_document text,
  add column issuer_name text,
  add column recipient_document text,
  add column recipient_name text,
  add column invoice_number text,
  add column invoice_series text,
  add column issued_at timestamptz,
  add column invoice_total numeric(18,6),
  add column fiscal_totals jsonb;

alter table public.receipt_documents
  add constraint receipt_documents_legal_entity_fk
  foreign key (company_id, supplier_legal_entity_id)
  references public.supplier_legal_entities(company_id, id) on delete restrict,
  add constraint receipt_documents_invoice_total_check
  check (invoice_total is null or invoice_total >= 0),
  add constraint receipt_documents_fiscal_totals_check
  check (fiscal_totals is null or jsonb_typeof(fiscal_totals) = 'object');

grant update on public.receipt_documents to authenticated;

create policy receipt_documents_update_draft
on public.receipt_documents for update to authenticated
using (
  (select private.has_permission(company_id, 'receipt.post'))
  and exists (
    select 1 from public.receipts receipt
    where receipt.company_id = receipt_documents.company_id
      and receipt.id = receipt_documents.receipt_id
      and receipt.status = 'draft'
  )
)
with check (
  (select private.has_permission(company_id, 'receipt.post'))
  and exists (
    select 1 from public.receipts receipt
    where receipt.company_id = receipt_documents.company_id
      and receipt.id = receipt_documents.receipt_id
      and receipt.status = 'draft'
  )
);

create index receipt_documents_issuer_idx
on public.receipt_documents(company_id, issuer_document);

create or replace function private.validate_receipt_document_issuer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supplier_legal_entity_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.receipts receipt
    join public.orders purchase_order
      on purchase_order.company_id = receipt.company_id
     and purchase_order.id = receipt.order_id
    join public.supplier_legal_entities entity
      on entity.company_id = purchase_order.company_id
     and entity.supplier_id = purchase_order.supplier_id
     and entity.id = new.supplier_legal_entity_id
    where receipt.company_id = new.company_id
      and receipt.id = new.receipt_id
      and (
        new.issuer_document is null
        or entity.document_number = pg_catalog.regexp_replace(
          new.issuer_document, '\D', '', 'g'
        )
      )
  ) then
    raise exception 'Empresa emitente não pertence ao fornecedor deste pedido';
  end if;

  return new;
end;
$$;

create trigger receipt_documents_validate_issuer
before insert or update of supplier_legal_entity_id, issuer_document
on public.receipt_documents
for each row execute function private.validate_receipt_document_issuer();

-- Documentos antigos podem ser ligados com segurança ao CNPJ principal do
-- fornecedor. Os demais metadados permanecem nulos, pois o XML está privado.
update public.receipt_documents document
set supplier_legal_entity_id = entity.id
from public.receipts receipt
join public.orders purchase_order
  on purchase_order.company_id = receipt.company_id
 and purchase_order.id = receipt.order_id
join public.supplier_legal_entities entity
  on entity.company_id = purchase_order.company_id
 and entity.supplier_id = purchase_order.supplier_id
 and entity.is_primary
where document.company_id = receipt.company_id
  and document.receipt_id = receipt.id
  and document.supplier_legal_entity_id is null;

create table public.receipt_item_documents (
  company_id uuid not null,
  receipt_item_id uuid not null,
  receipt_document_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (receipt_item_id),
  foreign key (company_id, receipt_item_id)
    references public.receipt_items(company_id, id) on delete cascade,
  foreign key (company_id, receipt_document_id)
    references public.receipt_documents(company_id, id) on delete restrict
);

create index receipt_item_documents_document_idx
on public.receipt_item_documents(company_id, receipt_document_id);

alter table public.receipt_item_documents enable row level security;
revoke all on public.receipt_item_documents from anon;
grant select on public.receipt_item_documents to authenticated;

create policy receipt_item_documents_select_member
on public.receipt_item_documents for select to authenticated
using ((select private.is_company_member(company_id)));

-- Recalcula o resumo do recebimento a partir de todas as NF-e anexadas. Os
-- tributos continuam informativos e não são incorporados ao preço unitário.
create or replace function public.rpc_refresh_receipt_nfe_totals(
  p_company_id uuid,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_totals jsonb;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if not exists (
    select 1 from public.receipts receipt
    where receipt.company_id = p_company_id
      and receipt.id = p_receipt_id
  ) then
    raise exception 'Recebimento não encontrado';
  end if;

  select case when count(*) = 0 then null else jsonb_build_object(
    'products', coalesce(sum((document.fiscal_totals ->> 'products')::numeric), 0),
    'freight', coalesce(sum((document.fiscal_totals ->> 'freight')::numeric), 0),
    'insurance', coalesce(sum((document.fiscal_totals ->> 'insurance')::numeric), 0),
    'discount', coalesce(sum((document.fiscal_totals ->> 'discount')::numeric), 0),
    'other', coalesce(sum((document.fiscal_totals ->> 'other')::numeric), 0),
    'importTax', coalesce(sum((document.fiscal_totals ->> 'importTax')::numeric), 0),
    'ipi', coalesce(sum((document.fiscal_totals ->> 'ipi')::numeric), 0),
    'returnedIpi', coalesce(sum((document.fiscal_totals ->> 'returnedIpi')::numeric), 0),
    'icmsSt', coalesce(sum((document.fiscal_totals ->> 'icmsSt')::numeric), 0),
    'fcpSt', coalesce(sum((document.fiscal_totals ->> 'fcpSt')::numeric), 0),
    'monophaseRetainedIcms', coalesce(sum((document.fiscal_totals ->> 'monophaseRetainedIcms')::numeric), 0),
    'services', coalesce(sum((document.fiscal_totals ->> 'services')::numeric), 0),
    'desoneratedIcms', coalesce(sum((document.fiscal_totals ->> 'desoneratedIcms')::numeric), 0),
    'estimatedTaxes', coalesce(sum((document.fiscal_totals ->> 'estimatedTaxes')::numeric), 0),
    'invoice', coalesce(sum((document.fiscal_totals ->> 'invoice')::numeric), 0),
    'composedTotal', coalesce(sum((document.fiscal_totals ->> 'composedTotal')::numeric), 0),
    'residual', coalesce(sum((document.fiscal_totals ->> 'residual')::numeric), 0)
  ) end
  into v_totals
  from public.receipt_documents document
  where document.company_id = p_company_id
    and document.receipt_id = p_receipt_id
    and document.kind = 'nfe_xml'
    and document.fiscal_totals is not null;

  update public.receipts
  set nfe_totals = v_totals
  where company_id = p_company_id and id = p_receipt_id;

  return v_totals;
end;
$$;

revoke all on function public.rpc_refresh_receipt_nfe_totals(uuid, uuid)
from public, anon;
grant execute on function public.rpc_refresh_receipt_nfe_totals(uuid, uuid)
to authenticated;

-- Confirma, uma única vez, que o CNPJ encontrado no XML pertence ao
-- fornecedor comercial deste pedido. As próximas notas são reconhecidas pelo
-- próprio CNPJ, sem trabalho do fornecedor.
create or replace function public.rpc_link_receipt_issuer(
  p_company_id uuid,
  p_receipt_id uuid,
  p_access_key text,
  p_adopt_as_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_document_id uuid;
  v_document_number text;
  v_issuer_name text;
  v_entity_id uuid;
  v_entity_supplier_id uuid;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  select purchase_order.supplier_id, document.id,
         pg_catalog.regexp_replace(coalesce(document.issuer_document, ''), '\D', '', 'g'),
         document.issuer_name
  into v_supplier_id, v_document_id, v_document_number, v_issuer_name
  from public.receipt_documents document
  join public.receipts receipt
    on receipt.company_id = document.company_id
   and receipt.id = document.receipt_id
  join public.orders purchase_order
    on purchase_order.company_id = receipt.company_id
   and purchase_order.id = receipt.order_id
  where document.company_id = p_company_id
    and document.receipt_id = p_receipt_id
    and document.access_key = p_access_key
    and receipt.status = 'draft'
  for update of document, receipt;

  if v_document_id is null then
    raise exception 'NF-e não encontrada ou conferência já finalizada';
  end if;
  if v_document_number is null or v_document_number !~ '^[0-9]{14}$' then
    raise exception 'O XML não contém um CNPJ de emitente válido';
  end if;

  select entity.id, entity.supplier_id
  into v_entity_id, v_entity_supplier_id
  from public.supplier_legal_entities entity
  where entity.company_id = p_company_id
    and entity.document_number = v_document_number
  for update;

  if v_entity_id is not null and v_entity_supplier_id <> v_supplier_id then
    raise exception 'Este CNPJ já está ligado a outro fornecedor comercial';
  end if;

  if v_entity_id is null then
    insert into public.supplier_legal_entities (
      company_id, supplier_id, document_number, legal_name,
      is_primary, source, created_by
    ) values (
      p_company_id, v_supplier_id, v_document_number, v_issuer_name,
      false, 'nfe', auth.uid()
    ) returning id into v_entity_id;
  else
    update public.supplier_legal_entities
    set legal_name = coalesce(nullif(v_issuer_name, ''), legal_name),
        is_active = true,
        updated_at = now()
    where company_id = p_company_id and id = v_entity_id;
  end if;

  if p_adopt_as_primary then
    perform private.require_permission(p_company_id, 'supplier.update');

    if exists (
      select 1 from public.suppliers supplier
      where supplier.company_id = p_company_id
        and supplier.id = v_supplier_id
        and supplier.document_number is not null
        and pg_catalog.regexp_replace(supplier.document_number, '\D', '', 'g')
          <> v_document_number
    ) then
      raise exception 'O fornecedor já possui outra empresa principal';
    end if;

    update public.supplier_legal_entities
    set is_primary = false
    where company_id = p_company_id
      and supplier_id = v_supplier_id
      and id <> v_entity_id
      and is_primary;

    update public.supplier_legal_entities
    set is_primary = true
    where company_id = p_company_id and id = v_entity_id;

    update public.suppliers
    set document_number = v_document_number,
        legal_name = coalesce(legal_name, nullif(v_issuer_name, ''))
    where company_id = p_company_id and id = v_supplier_id;
  end if;

  update public.receipt_documents
  set supplier_legal_entity_id = v_entity_id
  where company_id = p_company_id and id = v_document_id;

  return v_entity_id;
end;
$$;

revoke all on function public.rpc_link_receipt_issuer(uuid, uuid, text, boolean)
from public, anon;
grant execute on function public.rpc_link_receipt_issuer(uuid, uuid, text, boolean)
to authenticated;

-- A função original continua responsável por saldos e divergências. Esta
-- camada apenas liga cada item ao XML de origem na mesma transação.
create or replace function public.rpc_post_draft_receipt_with_documents(
  p_company_id uuid,
  p_receipt_id uuid,
  p_items jsonb,
  p_invoice_number text default null,
  p_invoice_series text default null,
  p_invoice_total numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_access_key text;
  v_document_id uuid;
  v_receipt_item_id uuid;
  v_document_count integer;
  v_document_numbers text;
  v_document_series text;
  v_document_total numeric;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if exists (
    select 1 from public.receipt_documents document
    where document.company_id = p_company_id
      and document.receipt_id = p_receipt_id
      and document.kind = 'nfe_xml'
      and document.supplier_legal_entity_id is null
  ) then
    raise exception 'Confirme a empresa emitente de todos os XMLs anexados';
  end if;

  select count(*),
         string_agg(document.invoice_number, ', ' order by document.issued_at, document.invoice_number),
         string_agg(distinct document.invoice_series, ', '),
         sum(document.invoice_total)
  into v_document_count, v_document_numbers, v_document_series, v_document_total
  from public.receipt_documents document
  where document.company_id = p_company_id
    and document.receipt_id = p_receipt_id
    and document.kind = 'nfe_xml';

  v_result := public.rpc_post_draft_receipt(
    p_company_id,
    p_receipt_id,
    p_items,
    case when v_document_count > 0 then v_document_numbers else p_invoice_number end,
    case when v_document_count > 0 then v_document_series else p_invoice_series end,
    case when v_document_count > 0 then v_document_total else p_invoice_total end,
    p_notes
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_access_key := nullif(v_item ->> 'receipt_access_key', '');
    if v_access_key is null then
      if v_document_count = 0 then
        continue;
      elsif v_document_count = 1 then
        select document.access_key into v_access_key
        from public.receipt_documents document
        where document.company_id = p_company_id
          and document.receipt_id = p_receipt_id
          and document.kind = 'nfe_xml';
      else
        raise exception 'Informe qual NF-e contém cada produto recebido';
      end if;
    end if;

    select document.id into v_document_id
    from public.receipt_documents document
    where document.company_id = p_company_id
      and document.receipt_id = p_receipt_id
      and document.access_key = v_access_key
      and document.supplier_legal_entity_id is not null;

    if v_document_id is null then
      raise exception 'Confirme a empresa emitente de todos os XMLs utilizados';
    end if;

    select item.id into v_receipt_item_id
    from public.receipt_items item
    where item.company_id = p_company_id
      and item.receipt_id = p_receipt_id
      and item.order_revision_item_id = (v_item ->> 'order_revision_item_id')::uuid;

    if v_receipt_item_id is null then
      raise exception 'Item conferido não encontrado';
    end if;

    insert into public.receipt_item_documents (
      company_id, receipt_item_id, receipt_document_id
    ) values (
      p_company_id, v_receipt_item_id, v_document_id
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.rpc_post_draft_receipt_with_documents(
  uuid, uuid, jsonb, text, text, numeric, text
) from public, anon;
grant execute on function public.rpc_post_draft_receipt_with_documents(
  uuid, uuid, jsonb, text, text, numeric, text
) to authenticated;

commit;
