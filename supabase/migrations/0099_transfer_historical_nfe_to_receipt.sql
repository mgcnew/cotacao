-- Permite reaproveitar em um recebimento uma NF-e que foi importada por
-- engano como histórico. A chave continua existindo uma única vez na análise:
-- enquanto transferida, os preços passam a ser efetivados pelo recebimento.

begin;

alter table public.historical_nfe_imports
  drop constraint if exists historical_nfe_imports_status_check;

alter table public.historical_nfe_imports
  add constraint historical_nfe_imports_status_check
    check (status in ('draft', 'posted', 'voided', 'transferred'));

alter table public.historical_nfe_imports
  add column if not exists transferred_receipt_id uuid,
  add column if not exists transferred_at timestamptz,
  add column if not exists transferred_by uuid references auth.users(id) on delete set null;

alter table public.historical_nfe_imports
  drop constraint if exists historical_nfe_imports_transfer_fk,
  drop constraint if exists historical_nfe_imports_transfer_state_check;

alter table public.historical_nfe_imports
  add constraint historical_nfe_imports_transfer_fk
    foreign key (company_id, transferred_receipt_id)
    references public.receipts(company_id, id) on delete restrict,
  add constraint historical_nfe_imports_transfer_state_check check (
    (status = 'transferred'
      and transferred_receipt_id is not null
      and transferred_at is not null)
    or
    (status <> 'transferred' and transferred_receipt_id is null)
  );

create index if not exists historical_nfe_imports_transfer_idx
on public.historical_nfe_imports(company_id, transferred_receipt_id)
where transferred_receipt_id is not null;

alter table public.receipt_documents
  add column if not exists storage_bucket text not null default 'receipt-documents',
  add column if not exists historical_import_id uuid;

alter table public.receipt_documents
  drop constraint if exists receipt_documents_storage_bucket_check,
  drop constraint if exists receipt_documents_historical_import_fk,
  drop constraint if exists receipt_documents_storage_origin_check;

alter table public.receipt_documents
  add constraint receipt_documents_storage_bucket_check
    check (storage_bucket in ('receipt-documents', 'historical-nfe-documents')),
  add constraint receipt_documents_historical_import_fk
    foreign key (company_id, historical_import_id)
    references public.historical_nfe_imports(company_id, id) on delete restrict,
  add constraint receipt_documents_storage_origin_check check (
    (storage_bucket = 'receipt-documents' and historical_import_id is null)
    or
    (storage_bucket = 'historical-nfe-documents' and historical_import_id is not null)
  );

create unique index if not exists receipt_documents_historical_import_uidx
on public.receipt_documents(company_id, historical_import_id)
where historical_import_id is not null;

-- O bloqueio geral de chave permanece. A única exceção é a transferência
-- previamente marcada para este mesmo recebimento e identificada pelo ID.
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

  if new.historical_import_id is not null and exists (
    select 1
    from public.historical_nfe_imports history
    where history.company_id = new.company_id
      and history.id = new.historical_import_id
      and history.access_key = new.access_key
      and history.status = 'transferred'
      and history.transferred_receipt_id = new.receipt_id
  ) then
    return new;
  end if;

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

create or replace function public.rpc_transfer_historical_nfe_to_receipt(
  p_company_id uuid,
  p_import_id uuid,
  p_receipt_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_history record;
  v_receipt_status text;
  v_order_supplier_id uuid;
  v_document_id uuid;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  select history.* into v_history
  from public.historical_nfe_imports history
  where history.company_id = p_company_id
    and history.id = p_import_id
  for update;

  if v_history.id is null then
    raise exception 'NF-e histórica não encontrada';
  end if;

  if v_history.status = 'transferred' then
    if v_history.transferred_receipt_id <> p_receipt_id then
      raise exception 'Esta NF-e já foi transferida para outro recebimento';
    end if;
    select document.id into v_document_id
    from public.receipt_documents document
    where document.company_id = p_company_id
      and document.historical_import_id = p_import_id;
    if v_document_id is not null then
      return v_document_id;
    end if;
  elsif v_history.status <> 'posted' then
    raise exception 'Somente uma NF-e conciliada pode ser transferida';
  end if;

  select receipt.status, purchase_order.supplier_id
  into v_receipt_status, v_order_supplier_id
  from public.receipts receipt
  join public.orders purchase_order
    on purchase_order.company_id = receipt.company_id
   and purchase_order.id = receipt.order_id
  where receipt.company_id = p_company_id
    and receipt.id = p_receipt_id
  for update of receipt;

  if v_receipt_status is null then
    raise exception 'Recebimento não encontrado';
  end if;
  if v_receipt_status <> 'draft' then
    raise exception 'O recebimento já foi conferido';
  end if;
  if v_history.supplier_id is null
     or v_history.supplier_id <> v_order_supplier_id then
    raise exception 'A NF-e e o pedido precisam pertencer ao mesmo fornecedor';
  end if;
  if v_history.supplier_legal_entity_id is null then
    raise exception 'A empresa emitente desta NF-e não está confirmada';
  end if;
  if exists (
    select 1 from public.receipt_documents document
    where document.company_id = p_company_id
      and document.access_key = v_history.access_key
      and document.historical_import_id is distinct from p_import_id
  ) then
    raise exception 'Esta NF-e já está vinculada a outro recebimento';
  end if;

  update public.historical_nfe_imports
  set status = 'transferred',
      transferred_receipt_id = p_receipt_id,
      transferred_at = now(),
      transferred_by = auth.uid(),
      voided_at = null,
      void_reason = null
  where company_id = p_company_id and id = p_import_id;

  insert into public.receipt_documents (
    company_id, receipt_id, kind, access_key, file_name, storage_path,
    storage_bucket, file_size, uploaded_by, supplier_legal_entity_id,
    issuer_document, issuer_name, recipient_document, recipient_name,
    invoice_number, invoice_series, issued_at, invoice_total, fiscal_totals,
    historical_import_id
  ) values (
    p_company_id, p_receipt_id, 'nfe_xml', v_history.access_key,
    v_history.file_name, v_history.storage_path, 'historical-nfe-documents',
    v_history.file_size::integer, auth.uid(),
    v_history.supplier_legal_entity_id, v_history.issuer_document,
    v_history.issuer_name, v_history.recipient_document,
    v_history.recipient_name, v_history.invoice_number,
    v_history.invoice_series, v_history.issued_at,
    v_history.invoice_total, v_history.fiscal_totals, p_import_id
  ) returning id into v_document_id;

  perform public.rpc_refresh_receipt_nfe_totals(p_company_id, p_receipt_id);

  perform private.emit_domain_event(
    p_company_id,
    'historical_nfe.transferred',
    'receipt',
    p_receipt_id,
    jsonb_build_object(
      'historical_import_id', p_import_id,
      'access_key', v_history.access_key
    )
  );

  return v_document_id;
end;
$$;

revoke all on function public.rpc_transfer_historical_nfe_to_receipt(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.rpc_transfer_historical_nfe_to_receipt(
  uuid, uuid, uuid
) to authenticated;

-- Remover o documento antes de concluir a conferência devolve a NF-e ao
-- histórico automaticamente. O XML original nunca é apagado nessa operação.
create or replace function public.rpc_restore_transferred_historical_nfe(
  p_company_id uuid,
  p_receipt_id uuid,
  p_access_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id uuid;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  select document.historical_import_id into v_import_id
  from public.receipt_documents document
  join public.receipts receipt
    on receipt.company_id = document.company_id
   and receipt.id = document.receipt_id
   and receipt.status = 'draft'
  where document.company_id = p_company_id
    and document.receipt_id = p_receipt_id
    and document.access_key = p_access_key
    and document.historical_import_id is not null
  for update of document;

  if v_import_id is null then
    return false;
  end if;

  delete from public.receipt_documents
  where company_id = p_company_id
    and receipt_id = p_receipt_id
    and historical_import_id = v_import_id;

  update public.historical_nfe_imports
  set status = 'posted',
      transferred_receipt_id = null,
      transferred_at = null,
      transferred_by = null
  where company_id = p_company_id
    and id = v_import_id
    and status = 'transferred'
    and transferred_receipt_id = p_receipt_id;

  perform public.rpc_refresh_receipt_nfe_totals(p_company_id, p_receipt_id);
  return true;
end;
$$;

revoke all on function public.rpc_restore_transferred_historical_nfe(
  uuid, uuid, text
) from public, anon;
grant execute on function public.rpc_restore_transferred_historical_nfe(
  uuid, uuid, text
) to authenticated;

commit;
