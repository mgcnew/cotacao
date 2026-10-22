-- 0120_unverified_receipt_prices.sql
--
-- Dar baixa no pedido sem a nota em mãos, sem inventar o preço.
--
-- O PROBLEMA
--
-- Quando a baixa não podia esperar pela nota, o campo "preço da nota" vinha
-- preenchido com o preço negociado e ninguém sabia que aquilo não tinha sido
-- conferido: o valor entrava como preço praticado, no histórico e nos
-- relatórios. Quando o real era outro, o sistema mostrava um dado errado com
-- cara de certo.
--
-- O QUE MUDA
--
-- 1. `receipt_items.price_unverified`: o item foi recebido, mas o preço ainda
--    é o negociado, não o da nota.
-- 2. `rpc_post_draft_receipt` aceita `price_unverified` por item. Nesse caso
--    grava o preço negociado, marca o item e NÃO abre divergência de preço
--    (não há preço real para comparar). Quantidades e saldo do pedido seguem
--    exatamente como antes.
-- 3. `rpc_confirm_receipt_prices`: quando a nota aparece, grava o preço real
--    nos itens marcados, tira a marca e abre a divergência de preço se o valor
--    for diferente do negociado — a mesma regra de uma conferência normal.
--
-- Os relatórios continuam lendo `practiced_price` e, até a confirmação, veem o
-- preço negociado. O selo "preço não conferido" e a fila de confirmação existem
-- para esse intervalo ser curto e visível.

begin;

alter table public.receipt_items
  add column if not exists price_unverified boolean not null default false;

create index if not exists receipt_items_price_unverified_idx
  on public.receipt_items (company_id, receipt_id)
  where price_unverified;

create or replace function public.rpc_post_draft_receipt(
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
  v_order_id uuid;
  v_current_revision_id uuid;
  v_order_status text;
  v_item jsonb;
  v_revision_item record;
  v_receipt_item_id uuid;
  v_logistic numeric(18,6);
  v_pricing numeric(18,6);
  v_practiced numeric(18,6);
  v_previous numeric(18,6);
  v_pending numeric(18,6);
  v_complete boolean;
  v_unverified boolean;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  select r.order_id into v_order_id
  from public.receipts r
  where r.id = p_receipt_id and r.company_id = p_company_id
    and r.status = 'draft'
  for update;

  if v_order_id is null then
    raise exception 'Chegada não encontrada ou já conferida';
  end if;

  select o.current_revision_id, o.status
  into v_current_revision_id, v_order_status
  from public.orders o
  where o.id = v_order_id and o.company_id = p_company_id
  for update;

  if v_current_revision_id is null
     or v_order_status not in ('awaiting_delivery', 'partially_received') then
    raise exception 'Pedido não está aguardando recebimento';
  end if;

  if not exists (
    select 1 from public.order_revisions r
    where r.id = v_current_revision_id and r.company_id = p_company_id
      and r.order_id = v_order_id and r.status = 'confirmed'
  ) then
    raise exception 'Revisão vigente ainda não foi confirmada pelo fornecedor';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Recebimento deve possuir ao menos um item';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_logistic := nullif(v_item ->> 'logistic_quantity_received', '')::numeric;
    v_pricing := nullif(v_item ->> 'pricing_quantity_received', '')::numeric;
    v_practiced := nullif(v_item ->> 'practiced_price', '')::numeric;
    v_unverified := coalesce((v_item ->> 'price_unverified')::boolean, false);

    -- Sem nota em mãos o preço não existe ainda: nada a validar nele.
    if v_logistic is null or v_logistic <= 0
       or v_pricing is null or v_pricing < 0
       or (not v_unverified and (v_practiced is null or v_practiced < 0)) then
      raise exception 'Dados inválidos no recebimento';
    end if;

    select ori.* into v_revision_item
    from public.order_revision_items ori
    where ori.id = (v_item ->> 'order_revision_item_id')::uuid
      and ori.company_id = p_company_id
      and ori.order_revision_id = v_current_revision_id;

    if v_revision_item.id is null then
      raise exception 'Item não pertence à revisão vigente do pedido';
    end if;

    -- Preço a confirmar: grava o negociado como referência, marcado. O valor
    -- vindo do cliente é ignorado de propósito — não há como "confirmar" um
    -- preço que o cliente não leu de nota nenhuma.
    if v_unverified then
      v_practiced := v_revision_item.agreed_price;
    end if;

    select coalesce(sum(ri.logistic_quantity_received), 0)
    into v_previous
    from public.receipt_items ri
    join public.receipts r
      on r.id = ri.receipt_id and r.company_id = ri.company_id
    where ri.company_id = p_company_id
      and ri.order_revision_item_id = v_revision_item.id
      and r.status = 'posted';
    v_pending := greatest(v_revision_item.requested_quantity - v_previous, 0);

    insert into public.receipt_items (
      company_id, receipt_id, order_revision_item_id,
      logistic_quantity_received, pricing_quantity_received,
      practiced_price, price_unverified, notes
    ) values (
      p_company_id, p_receipt_id, v_revision_item.id,
      v_logistic, v_pricing, v_practiced, v_unverified,
      nullif(v_item ->> 'notes', '')
    ) returning id into v_receipt_item_id;

    if not v_unverified and v_practiced <> v_revision_item.agreed_price then
      insert into public.commercial_divergences (
        company_id, supplier_id, order_id, order_revision_item_id,
        receipt_item_id, type, agreed_value, realized_value,
        financial_impact, status, created_by
      )
      select p_company_id, o.supplier_id, v_order_id, v_revision_item.id,
        v_receipt_item_id, 'price',
        jsonb_build_object('price', v_revision_item.agreed_price),
        jsonb_build_object('price', v_practiced),
        (v_practiced - v_revision_item.agreed_price) * v_pricing,
        'pending', auth.uid()
      from public.orders o
      where o.id = v_order_id and o.company_id = p_company_id;

      perform private.emit_domain_event(
        p_company_id, 'commercial_divergence.detected', 'receipt_item',
        v_receipt_item_id,
        jsonb_build_object(
          'type', 'price', 'agreed_price', v_revision_item.agreed_price,
          'practiced_price', v_practiced,
          'pricing_quantity_received', v_pricing
        )
      );
    end if;

    -- Entrega parcial é normal; somente excesso é uma divergência objetiva.
    if v_logistic > v_pending then
      insert into public.commercial_divergences (
        company_id, supplier_id, order_id, order_revision_item_id,
        receipt_item_id, type, agreed_value, realized_value,
        financial_impact, status, created_by
      )
      select p_company_id, o.supplier_id, v_order_id, v_revision_item.id,
        v_receipt_item_id, 'quantity',
        jsonb_build_object('pending_quantity', v_pending),
        jsonb_build_object('received_quantity', v_logistic),
        null, 'pending', auth.uid()
      from public.orders o
      where o.id = v_order_id and o.company_id = p_company_id;
    end if;
  end loop;

  update public.receipts
  set status = 'posted',
      invoice_number = coalesce(nullif(btrim(p_invoice_number), ''), invoice_number),
      invoice_series = coalesce(nullif(btrim(p_invoice_series), ''), invoice_series),
      invoice_total = coalesce(p_invoice_total, invoice_total),
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      checked_by = auth.uid(), checked_at = now()
  where id = p_receipt_id and company_id = p_company_id;

  select not exists (
    select 1
    from public.order_revision_items ori
    where ori.order_revision_id = v_current_revision_id
      and ori.company_id = p_company_id
      and coalesce((
        select sum(ri.logistic_quantity_received)
        from public.receipt_items ri
        join public.receipts r
          on r.id = ri.receipt_id and r.company_id = ri.company_id
        where ri.order_revision_item_id = ori.id
          and ri.company_id = p_company_id and r.status = 'posted'
      ), 0) < ori.requested_quantity
  ) into v_complete;

  update public.orders
  set status = case when v_complete then 'received' else 'partially_received' end,
      completed_at = case when v_complete then now() else null end
  where id = v_order_id and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id, 'receipt.posted', 'order', v_order_id,
    jsonb_build_object(
      'receipt_id', p_receipt_id,
      'complete', v_complete,
      'invoice_total', p_invoice_total
    )
  );

  return jsonb_build_object(
    'receipt_id', p_receipt_id,
    'order_id', v_order_id,
    'order_status', case when v_complete then 'received' else 'partially_received' end
  );
end;
$$;

-- Grava os preços reais de itens recebidos "sem nota". `p_items` é uma lista de
-- { receipt_item_id, practiced_price, pricing_quantity_received? }. Só itens
-- ainda marcados são aceitos: confirmar de novo um preço já conferido seria
-- reescrever histórico.
create or replace function public.rpc_confirm_receipt_prices(
  p_company_id uuid,
  p_receipt_id uuid,
  p_items jsonb,
  p_invoice_number text default null,
  p_invoice_series text default null,
  p_invoice_total numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_receipt_item record;
  v_agreed numeric(18,6);
  v_practiced numeric(18,6);
  v_pricing numeric(18,6);
  v_confirmed integer := 0;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  select r.order_id into v_order_id
  from public.receipts r
  where r.id = p_receipt_id and r.company_id = p_company_id
    and r.status = 'posted'
  for update;

  if v_order_id is null then
    raise exception 'Recebimento não encontrado ou ainda não conferido';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um preço para confirmar';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_practiced := nullif(v_item ->> 'practiced_price', '')::numeric;
    v_pricing := nullif(v_item ->> 'pricing_quantity_received', '')::numeric;

    if v_practiced is null or v_practiced < 0
       or (v_pricing is not null and v_pricing < 0) then
      raise exception 'Preço inválido na confirmação';
    end if;

    select ri.id, ri.order_revision_item_id, ri.pricing_quantity_received
    into v_receipt_item
    from public.receipt_items ri
    where ri.id = (v_item ->> 'receipt_item_id')::uuid
      and ri.company_id = p_company_id
      and ri.receipt_id = p_receipt_id
      and ri.price_unverified
    for update;

    if v_receipt_item.id is null then
      raise exception 'Item não encontrado ou com preço já confirmado';
    end if;

    select ori.agreed_price into v_agreed
    from public.order_revision_items ori
    where ori.id = v_receipt_item.order_revision_item_id
      and ori.company_id = p_company_id;

    update public.receipt_items
    set practiced_price = v_practiced,
        pricing_quantity_received = coalesce(v_pricing, pricing_quantity_received),
        price_unverified = false
    where id = v_receipt_item.id and company_id = p_company_id;

    v_pricing := coalesce(v_pricing, v_receipt_item.pricing_quantity_received);

    if v_practiced <> v_agreed then
      insert into public.commercial_divergences (
        company_id, supplier_id, order_id, order_revision_item_id,
        receipt_item_id, type, agreed_value, realized_value,
        financial_impact, status, created_by
      )
      select p_company_id, o.supplier_id, v_order_id,
        v_receipt_item.order_revision_item_id, v_receipt_item.id, 'price',
        jsonb_build_object('price', v_agreed),
        jsonb_build_object('price', v_practiced),
        (v_practiced - v_agreed) * v_pricing,
        'pending', auth.uid()
      from public.orders o
      where o.id = v_order_id and o.company_id = p_company_id;

      perform private.emit_domain_event(
        p_company_id, 'commercial_divergence.detected', 'receipt_item',
        v_receipt_item.id,
        jsonb_build_object(
          'type', 'price', 'agreed_price', v_agreed,
          'practiced_price', v_practiced,
          'pricing_quantity_received', v_pricing
        )
      );
    end if;

    v_confirmed := v_confirmed + 1;
  end loop;

  update public.receipts
  set invoice_number = coalesce(nullif(btrim(p_invoice_number), ''), invoice_number),
      invoice_series = coalesce(nullif(btrim(p_invoice_series), ''), invoice_series),
      invoice_total = coalesce(p_invoice_total, invoice_total)
  where id = p_receipt_id and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id, 'receipt.prices_confirmed', 'order', v_order_id,
    jsonb_build_object('receipt_id', p_receipt_id, 'items', v_confirmed)
  );

  return jsonb_build_object(
    'receipt_id', p_receipt_id,
    'order_id', v_order_id,
    'confirmed_items', v_confirmed,
    'pending_items', (
      select count(*) from public.receipt_items ri
      where ri.company_id = p_company_id
        and ri.receipt_id = p_receipt_id
        and ri.price_unverified
    )
  );
end;
$$;

revoke all on function public.rpc_post_draft_receipt(uuid,uuid,jsonb,text,text,numeric,text)
  from public, anon;
grant execute on function public.rpc_post_draft_receipt(uuid,uuid,jsonb,text,text,numeric,text)
  to authenticated;

revoke all on function public.rpc_confirm_receipt_prices(uuid,uuid,jsonb,text,text,numeric)
  from public, anon;
grant execute on function public.rpc_confirm_receipt_prices(uuid,uuid,jsonb,text,text,numeric)
  to authenticated;

commit;
