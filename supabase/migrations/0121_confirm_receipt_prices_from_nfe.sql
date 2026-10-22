-- 0121_confirm_receipt_prices_from_nfe.sql
--
-- O caminho inverso da 0120: a NF-e chega pelo histórico fiscal e o sistema a
-- aponta para um pedido que já foi baixado SEM nota. Esta função confirma, de
-- uma vez, os preços desse pedido com os da nota.
--
-- POR QUE NÃO BASTA `rpc_confirm_receipt_prices`
--
-- Ela grava os preços, mas a nota continuaria no histórico fiscal como compra
-- independente: o mesmo gasto contaria duas vezes nos preços praticados. O
-- desenho do sistema é que a nota "transferida" deixa de valer pelo histórico
-- e passa a valer pelo recebimento. Só que a transferência existente
-- (`rpc_transfer_historical_nfe_to_receipt`) exige recebimento em rascunho, e
-- este já está conferido. Aqui as duas coisas acontecem na mesma transação:
--
-- 1. os preços dos itens ainda marcados são confirmados com os da nota — pela
--    própria `rpc_confirm_receipt_prices`, então a regra de divergência de
--    preço é a mesma de uma conferência normal;
-- 2. a nota é anexada ao recebimento, ligada aos itens que confirmou, e sai do
--    histórico fiscal independente.
--
-- Só o preço é aplicado. A quantidade de precificação continua a da baixa: a
-- nota pode cobrir só parte do que chegou, e trocar a quantidade por ela
-- reescreveria o que foi conferido fisicamente.

begin;

create or replace function public.rpc_confirm_receipt_prices_from_nfe(
  p_company_id uuid,
  p_receipt_id uuid,
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_history record;
  v_receipt record;
  v_items jsonb;
  v_result jsonb;
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
    raise exception 'Esta NF-e já foi transferida para um recebimento';
  end if;
  if v_history.status not in ('draft', 'posted') then
    raise exception 'Esta NF-e foi descartada e não pode ser usada';
  end if;

  select receipt.status, receipt.invoice_number, purchase_order.supplier_id
  into v_receipt
  from public.receipts receipt
  join public.orders purchase_order
    on purchase_order.company_id = receipt.company_id
   and purchase_order.id = receipt.order_id
  where receipt.company_id = p_company_id
    and receipt.id = p_receipt_id
  for update of receipt;

  if v_receipt.status is null then
    raise exception 'Recebimento não encontrado';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'Só um recebimento já conferido tem preços a confirmar';
  end if;
  if v_history.supplier_id is null
     or v_history.supplier_id <> v_receipt.supplier_id then
    raise exception 'A NF-e e o pedido precisam pertencer ao mesmo fornecedor';
  end if;
  if v_history.supplier_legal_entity_id is null then
    raise exception 'A empresa emitente desta NF-e não está confirmada';
  end if;
  if exists (
    select 1 from public.receipt_documents document
    where document.company_id = p_company_id
      and document.access_key = v_history.access_key
  ) then
    raise exception 'Esta NF-e já está vinculada a outro recebimento';
  end if;

  -- Os itens sem preço confirmado cujo produto veio na nota com preço. Se a
  -- nota repete o produto (lotes, bonificação), vale a primeira linha cobrada.
  select jsonb_agg(jsonb_build_object(
    'receipt_item_id', found.receipt_item_id,
    'practiced_price', found.practiced_price
  ))
  into v_items
  from (
    select receipt_item.id as receipt_item_id, nfe_item.practiced_price
    from public.receipt_items receipt_item
    join public.order_revision_items revision_item
      on revision_item.company_id = receipt_item.company_id
     and revision_item.id = receipt_item.order_revision_item_id
    join lateral (
      select item.practiced_price
      from public.historical_nfe_items item
      where item.company_id = p_company_id
        and item.import_id = p_import_id
        and item.product_id = revision_item.product_id
        and item.reconciliation_status = 'matched'
        and item.practiced_price is not null
      order by (item.practiced_price > 0) desc, item.line_number
      limit 1
    ) nfe_item on true
    where receipt_item.company_id = p_company_id
      and receipt_item.receipt_id = p_receipt_id
      and receipt_item.price_unverified
  ) found;

  if v_items is null then
    raise exception 'Esta NF-e não traz nenhum produto com preço a confirmar neste recebimento';
  end if;

  -- O número da nota só vai para o recebimento quando ele ainda não tem um:
  -- com mais de uma nota o recebimento não é de uma nota só.
  v_result := public.rpc_confirm_receipt_prices(
    p_company_id,
    p_receipt_id,
    v_items,
    case when v_receipt.invoice_number is null then v_history.invoice_number end,
    case when v_receipt.invoice_number is null then v_history.invoice_series end,
    null
  );

  update public.historical_nfe_imports
  set status = 'transferred',
      transferred_from_status = v_history.status,
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

  -- Liga a nota aos itens que ela confirmou. Item que já tinha outra nota
  -- ligada fica como está.
  insert into public.receipt_item_documents (
    company_id, receipt_item_id, receipt_document_id
  )
  select p_company_id, (entry ->> 'receipt_item_id')::uuid, v_document_id
  from jsonb_array_elements(v_items) entry
  on conflict (receipt_item_id) do nothing;

  perform public.rpc_refresh_receipt_nfe_totals(p_company_id, p_receipt_id);

  perform private.emit_domain_event(
    p_company_id,
    'historical_nfe.transferred',
    'receipt',
    p_receipt_id,
    jsonb_build_object(
      'historical_import_id', p_import_id,
      'access_key', v_history.access_key,
      'confirmed_prices', true
    )
  );

  return v_result || jsonb_build_object('document_id', v_document_id);
end;
$$;

revoke all on function public.rpc_confirm_receipt_prices_from_nfe(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.rpc_confirm_receipt_prices_from_nfe(uuid, uuid, uuid)
  to authenticated;

commit;
