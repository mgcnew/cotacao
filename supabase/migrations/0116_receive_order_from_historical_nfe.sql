-- NF-e importada no histórico que, na verdade, é a nota de um pedido que
-- ninguém deu entrada. O sistema sugere o pedido; esta migration permite
-- concluir a sugestão em um passo só: abre a chegada do pedido (se ainda não
-- existir) e transfere a nota para a conferência.
--
-- Duas mudanças no que já existia:
--
-- 1. A transferência aceitava apenas nota conciliada ("No histórico"). Para
--    usar a nota num recebimento ninguém precisa associar produto por produto
--    antes — a conferência do recebimento faz isso contra o pedido. Agora o
--    rascunho também pode ser transferido.
--
-- 2. Desfazer a transferência devolvia a nota sempre como conciliada. Vinda de
--    um rascunho, ela entraria no histórico de preços sem ninguém ter
--    conferido as associações. A origem passa a ser guardada e respeitada.

begin;

alter table public.historical_nfe_imports
  add column if not exists transferred_from_status text;

alter table public.historical_nfe_imports
  drop constraint if exists historical_nfe_imports_transferred_from_check;

alter table public.historical_nfe_imports
  add constraint historical_nfe_imports_transferred_from_check check (
    transferred_from_status is null
    or transferred_from_status in ('draft', 'posted')
  );

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
  elsif v_history.status not in ('draft', 'posted') then
    raise exception 'Esta NF-e foi descartada e não pode ser transferida';
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
      transferred_from_status = case
        when v_history.status = 'transferred'
          then coalesce(v_history.transferred_from_status, 'posted')
        else v_history.status
      end,
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

  -- Notas transferidas antes desta migration não têm origem gravada; todas
  -- elas vinham de "posted", a única origem aceita até então.
  update public.historical_nfe_imports
  set status = coalesce(transferred_from_status, 'posted'),
      transferred_from_status = null,
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

-- Dar entrada num pedido a partir da NF-e histórica sugerida.
--
-- A chegada é registrada na data de emissão da nota, e não agora: a entrada
-- costuma acontecer dias depois, e "agora" faria a entrega parecer atrasada
-- no desempenho do fornecedor. A emissão é o melhor dado que se tem de quando
-- a mercadoria veio — a conferência continua podendo corrigi-la.
create or replace function public.rpc_receive_order_with_historical_nfe(
  p_company_id uuid,
  p_import_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_history record;
  v_order_supplier_id uuid;
  v_receipt_id uuid;
  v_arrival jsonb;
begin
  perform private.require_permission(p_company_id, 'receipt.create');
  perform private.require_permission(p_company_id, 'receipt.post');

  select history.* into v_history
  from public.historical_nfe_imports history
  where history.company_id = p_company_id
    and history.id = p_import_id
  for update;

  if v_history.id is null then
    raise exception 'NF-e histórica não encontrada';
  end if;
  if v_history.status not in ('draft', 'posted') then
    raise exception 'Esta NF-e já foi transferida ou descartada';
  end if;

  select purchase_order.supplier_id into v_order_supplier_id
  from public.orders purchase_order
  where purchase_order.company_id = p_company_id
    and purchase_order.id = p_order_id;

  if v_order_supplier_id is null then
    raise exception 'Pedido não encontrado';
  end if;
  if v_history.supplier_id is distinct from v_order_supplier_id then
    raise exception 'A NF-e e o pedido precisam pertencer ao mesmo fornecedor';
  end if;

  -- Uma chegada já aberta para o pedido é reaproveitada: a nota vai para ela.
  select receipt.id into v_receipt_id
  from public.receipts receipt
  where receipt.company_id = p_company_id
    and receipt.order_id = p_order_id
    and receipt.status = 'draft'
  order by receipt.created_at desc
  limit 1;

  if v_receipt_id is null then
    v_arrival := public.rpc_register_order_arrival(
      p_company_id,
      p_order_id,
      v_history.issued_at,
      v_history.invoice_number,
      v_history.invoice_series,
      v_history.invoice_total,
      null
    );
    v_receipt_id := (v_arrival ->> 'receipt_id')::uuid;
  end if;

  perform public.rpc_transfer_historical_nfe_to_receipt(
    p_company_id, p_import_id, v_receipt_id
  );

  return jsonb_build_object('receipt_id', v_receipt_id, 'order_id', p_order_id);
end;
$$;

revoke all on function public.rpc_receive_order_with_historical_nfe(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.rpc_receive_order_with_historical_nfe(
  uuid, uuid, uuid
) to authenticated;

commit;
