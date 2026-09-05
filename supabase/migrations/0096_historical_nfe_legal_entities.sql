-- Aplica ao histórico fiscal a separação introduzida na 0095 entre o
-- fornecedor comercial e a empresa/CNPJ que efetivamente emitiu a NF-e.

begin;

alter table public.historical_nfe_imports
  add column supplier_legal_entity_id uuid;

alter table public.historical_nfe_imports
  add constraint historical_nfe_imports_legal_entity_fk
  foreign key (company_id, supplier_legal_entity_id)
  references public.supplier_legal_entities(company_id, id) on delete restrict;

create index historical_nfe_imports_legal_entity_idx
on public.historical_nfe_imports(company_id, supplier_legal_entity_id, issued_at desc);

-- Recupera automaticamente o vínculo das notas já importadas quando o CNPJ e
-- o fornecedor comercial permitem uma associação inequívoca.
update public.historical_nfe_imports history
set supplier_legal_entity_id = entity.id
from public.supplier_legal_entities entity
where history.company_id = entity.company_id
  and history.supplier_id = entity.supplier_id
  and pg_catalog.regexp_replace(
    coalesce(history.issuer_document, ''), '\D', '', 'g'
  ) = entity.document_number
  and history.supplier_legal_entity_id is null;

create or replace function public.rpc_link_historical_nfe_issuer(
  p_company_id uuid,
  p_import_id uuid,
  p_supplier_id uuid,
  p_adopt_as_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_number text;
  v_issuer_name text;
  v_entity_id uuid;
  v_entity_supplier_id uuid;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if not exists (
    select 1 from public.suppliers supplier
    where supplier.company_id = p_company_id and supplier.id = p_supplier_id
  ) then
    raise exception 'Escolha um fornecedor válido';
  end if;

  select
    pg_catalog.regexp_replace(
      coalesce(history.issuer_document, ''), '\D', '', 'g'
    ),
    history.issuer_name
  into v_document_number, v_issuer_name
  from public.historical_nfe_imports history
  where history.company_id = p_company_id
    and history.id = p_import_id
    and history.status = 'draft'
  for update;

  if not found then
    raise exception 'Importação não encontrada ou já concluída';
  end if;
  if v_document_number !~ '^[0-9]{14}$' then
    raise exception 'O XML não contém um CNPJ de emitente válido';
  end if;

  select entity.id, entity.supplier_id
  into v_entity_id, v_entity_supplier_id
  from public.supplier_legal_entities entity
  where entity.company_id = p_company_id
    and entity.document_number = v_document_number
  for update;

  if v_entity_id is not null and v_entity_supplier_id <> p_supplier_id then
    raise exception 'Este CNPJ já está ligado a outro fornecedor comercial';
  end if;

  if v_entity_id is null then
    insert into public.supplier_legal_entities (
      company_id, supplier_id, document_number, legal_name,
      is_primary, source, created_by
    ) values (
      p_company_id, p_supplier_id, v_document_number, v_issuer_name,
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
        and supplier.id = p_supplier_id
        and supplier.document_number is not null
        and pg_catalog.regexp_replace(supplier.document_number, '\D', '', 'g')
          <> v_document_number
    ) then
      raise exception 'O fornecedor já possui outra empresa principal';
    end if;

    update public.supplier_legal_entities
    set is_primary = false
    where company_id = p_company_id
      and supplier_id = p_supplier_id
      and id <> v_entity_id
      and is_primary;

    update public.supplier_legal_entities
    set is_primary = true
    where company_id = p_company_id and id = v_entity_id;

    update public.suppliers
    set document_number = v_document_number,
        legal_name = coalesce(legal_name, nullif(v_issuer_name, ''))
    where company_id = p_company_id and id = p_supplier_id;
  end if;

  update public.historical_nfe_imports
  set supplier_id = p_supplier_id,
      supplier_legal_entity_id = v_entity_id
  where company_id = p_company_id and id = p_import_id;

  return v_entity_id;
end;
$$;

revoke all on function public.rpc_link_historical_nfe_issuer(
  uuid, uuid, uuid, boolean
) from public, anon;
grant execute on function public.rpc_link_historical_nfe_issuer(
  uuid, uuid, uuid, boolean
) to authenticated;

-- Mantém toda a lógica original de publicação e troca somente a validação do
-- emitente: qualquer CNPJ previamente ligado ao fornecedor comercial é válido.
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
    select 1 from public.suppliers supplier
    where supplier.company_id = p_company_id and supplier.id = p_supplier_id
  ) then
    raise exception 'Escolha um fornecedor válido';
  end if;
  if not exists (
    select 1
    from public.historical_nfe_imports history
    join public.supplier_legal_entities entity
      on entity.company_id = history.company_id
     and entity.id = history.supplier_legal_entity_id
     and entity.supplier_id = p_supplier_id
     and entity.document_number = pg_catalog.regexp_replace(
       coalesce(history.issuer_document, ''), '\D', '', 'g'
     )
    where history.company_id = p_company_id
      and history.id = p_import_id
  ) then
    raise exception 'Confirme a empresa emitente desta NF-e';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Conciliação de produtos inválida';
  end if;

  perform 1 from public.historical_nfe_imports history
  where history.company_id = p_company_id
    and history.id = p_import_id
    and history.status = 'draft'
  for update;
  if not found then
    raise exception 'Importação não encontrada ou já concluída';
  end if;

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
      set product_id = null,
          pricing_quantity = null,
          practiced_price = null,
          reconciliation_status = 'ignored',
          notes = nullif(pg_catalog.btrim(v_entry ->> 'notes'), '')
      where company_id = p_company_id
        and import_id = p_import_id
        and id = (v_entry ->> 'id')::uuid;
    else
      v_product_id := nullif(v_entry ->> 'product_id', '')::uuid;
      if v_product_id is null or not exists (
        select 1 from public.products product
        where product.company_id = p_company_id
          and product.id = v_product_id
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
      where company_id = p_company_id
        and import_id = p_import_id
        and id = (v_entry ->> 'id')::uuid;
    end if;
    if not found then
      raise exception 'Item da conciliação não encontrado';
    end if;
  end loop;

  for v_item in
    select item.* from public.historical_nfe_items item
    where item.company_id = p_company_id
      and item.import_id = p_import_id
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
      select alias.id into v_alias_id
      from public.supplier_product_aliases alias
      where alias.company_id = p_company_id
        and alias.supplier_id = p_supplier_id
        and alias.supplier_code = v_code
      for update;
    end if;
    if v_alias_id is null then
      select alias.id into v_alias_id
      from public.supplier_product_aliases alias
      where alias.company_id = p_company_id
        and alias.supplier_id = p_supplier_id
        and alias.normalized_name = v_normalized_name
      for update;
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
          last_seen_at = now(),
          source = 'nfe'
      where company_id = p_company_id and id = v_alias_id;
    end if;
  end loop;

  update public.historical_nfe_imports
  set supplier_id = p_supplier_id,
      status = 'posted',
      posted_by = auth.uid(),
      posted_at = now()
  where company_id = p_company_id and id = p_import_id;
end;
$$;

revoke all on function public.rpc_post_historical_nfe_import(
  uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.rpc_post_historical_nfe_import(
  uuid, uuid, uuid, jsonb
) to authenticated;

create or replace view public.v_purchase_price_history
with (security_invoker = true)
as
select
  receipt_item.company_id,
  receipt_item.id as event_id,
  'receipt'::text as source,
  revision_item.product_id,
  product.name as product_name,
  purchase_order.supplier_id,
  supplier.name as supplier_name,
  receipt.received_at as occurred_at,
  receipt_item.pricing_quantity_received as pricing_quantity,
  receipt_item.practiced_price,
  unit.symbol as pricing_unit_symbol,
  coalesce(document.invoice_number, receipt.invoice_number) as invoice_number,
  coalesce(document.invoice_series, receipt.invoice_series) as invoice_series,
  document.access_key,
  receipt.id as receipt_id,
  null::uuid as historical_import_id,
  coalesce(entity.legal_name, document.issuer_name) as issuer_name,
  coalesce(entity.document_number, document.issuer_document) as issuer_document
from public.receipt_items receipt_item
join public.receipts receipt
  on receipt.id = receipt_item.receipt_id
 and receipt.company_id = receipt_item.company_id
 and receipt.status = 'posted'
join public.orders purchase_order
  on purchase_order.id = receipt.order_id
 and purchase_order.company_id = receipt.company_id
join public.suppliers supplier
  on supplier.id = purchase_order.supplier_id
 and supplier.company_id = purchase_order.company_id
join public.order_revision_items revision_item
  on revision_item.id = receipt_item.order_revision_item_id
 and revision_item.company_id = receipt_item.company_id
join public.products product
  on product.id = revision_item.product_id
 and product.company_id = revision_item.company_id
join public.units unit
  on unit.id = revision_item.pricing_unit_id
 and unit.company_id = revision_item.company_id
left join public.receipt_item_documents item_document
  on item_document.company_id = receipt_item.company_id
 and item_document.receipt_item_id = receipt_item.id
left join public.receipt_documents document
  on document.company_id = item_document.company_id
 and document.id = item_document.receipt_document_id
left join public.supplier_legal_entities entity
  on entity.company_id = document.company_id
 and entity.id = document.supplier_legal_entity_id
union all
select
  item.company_id,
  item.id,
  'historical_nfe'::text,
  item.product_id,
  product.name,
  history.supplier_id,
  supplier.name,
  history.issued_at,
  item.pricing_quantity,
  item.practiced_price,
  unit.symbol,
  history.invoice_number,
  history.invoice_series,
  history.access_key,
  null::uuid,
  history.id,
  coalesce(entity.legal_name, history.issuer_name),
  coalesce(entity.document_number, history.issuer_document)
from public.historical_nfe_items item
join public.historical_nfe_imports history
  on history.company_id = item.company_id
 and history.id = item.import_id
 and history.status = 'posted'
join public.products product
  on product.company_id = item.company_id and product.id = item.product_id
join public.units unit
  on unit.company_id = product.company_id and unit.id = product.pricing_unit_id
join public.suppliers supplier
  on supplier.company_id = history.company_id
 and supplier.id = history.supplier_id
left join public.supplier_legal_entities entity
  on entity.company_id = history.company_id
 and entity.id = history.supplier_legal_entity_id
where item.reconciliation_status = 'matched';

grant select on public.v_purchase_price_history to authenticated;

commit;
