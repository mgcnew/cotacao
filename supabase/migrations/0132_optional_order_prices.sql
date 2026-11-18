-- 0132_optional_order_prices.sql
-- Aplicar manualmente antes de usar pedidos sem preço.
begin;
alter table public.order_revision_items alter column agreed_price drop not null;


create or replace function public.rpc_create_direct_order(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_revision_id uuid;
  v_item jsonb;
  v_product record;
  v_requested numeric(18,6);
  v_agreed numeric(18,6);
begin
  perform private.require_permission(p_company_id, 'order.create');

  if not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id
      and s.company_id = p_company_id
      and s.status = 'active'
  ) then
    raise exception 'Fornecedor inválido ou inativo';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido deve possuir ao menos um item';
  end if;

  insert into public.orders (
    company_id, supplier_id, origin, status, created_by
  )
  values (
    p_company_id, p_supplier_id, 'direct', 'draft', auth.uid()
  )
  returning id into v_order_id;

  insert into public.order_revisions (
    company_id, order_id, revision_number, status, delivery_due_date, created_by
  )
  values (
    p_company_id, v_order_id, 1, 'draft', p_delivery_due_date, auth.uid()
  )
  returning id into v_revision_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := nullif(v_item ->> 'requested_quantity', '')::numeric;
    v_agreed := nullif(v_item ->> 'agreed_price', '')::numeric;

    if v_requested is null or v_requested <= 0
       or v_agreed < 0 then
      raise exception 'Quantidade ou preço inválido em pedido direto';
    end if;

    select p.id, p.name
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.company_id = p_company_id
      and p.is_active = true;

    if v_product.id is null then
      raise exception 'Produto inválido no pedido direto';
    end if;

    -- As FKs compostas validarão unidades contra a empresa.
    insert into public.order_revision_items (
      company_id,
      order_revision_id,
      purchase_allocation_id,
      product_id,
      product_name_snapshot,
      requested_quantity,
      purchase_unit_id,
      pricing_unit_id,
      comparison_unit_id,
      estimated_pricing_quantity,
      agreed_price,
      notes
    )
    values (
      p_company_id,
      v_revision_id,
      null,
      v_product.id,
      v_product.name,
      v_requested,
      (v_item ->> 'purchase_unit_id')::uuid,
      (v_item ->> 'pricing_unit_id')::uuid,
      nullif(v_item ->> 'comparison_unit_id', '')::uuid,
      nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
      v_agreed,
      nullif(v_item ->> 'notes', '')
    );
  end loop;

  update public.orders
  set current_revision_id = v_revision_id
  where id = v_order_id and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.created',
    'order',
    v_order_id,
    jsonb_build_object(
      'origin', 'direct',
      'order_revision_id', v_revision_id,
      'supplier_id', p_supplier_id
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', v_revision_id
  );
end;
$$;

create or replace function public.rpc_create_order_revision(
  p_company_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision_number integer;
  v_revision_id uuid;
  v_item jsonb;
  v_product record;
  v_requested numeric(18,6);
  v_agreed numeric(18,6);
begin
  perform private.require_permission(p_company_id, 'order.revise');

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.company_id = p_company_id
      and o.status not in ('received','cancelled')
  ) then
    raise exception 'Pedido inexistente ou não permite revisão';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Revisão deve possuir ao menos um item';
  end if;

  if exists (
    select 1
    from public.order_revisions r
    where r.order_id = p_order_id
      and r.company_id = p_company_id
      and r.status = 'draft'
  ) then
    raise exception 'Já existe uma revisão em rascunho para este pedido';
  end if;

  select coalesce(max(r.revision_number), 0) + 1
  into v_revision_number
  from public.order_revisions r
  where r.order_id = p_order_id
    and r.company_id = p_company_id;

  insert into public.order_revisions (
    company_id,
    order_id,
    revision_number,
    status,
    delivery_due_date,
    created_by
  )
  values (
    p_company_id,
    p_order_id,
    v_revision_number,
    'draft',
    p_delivery_due_date,
    auth.uid()
  )
  returning id into v_revision_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := nullif(v_item ->> 'requested_quantity', '')::numeric;
    v_agreed := nullif(v_item ->> 'agreed_price', '')::numeric;

    if v_requested is null or v_requested <= 0
       or v_agreed < 0 then
      raise exception 'Quantidade ou preço inválido na revisão';
    end if;

    select p.id, p.name
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.company_id = p_company_id;

    if v_product.id is null then
      raise exception 'Produto inválido na revisão';
    end if;

    insert into public.order_revision_items (
      company_id,
      order_revision_id,
      purchase_allocation_id,
      product_id,
      product_name_snapshot,
      requested_quantity,
      purchase_unit_id,
      pricing_unit_id,
      comparison_unit_id,
      estimated_pricing_quantity,
      agreed_price,
      notes
    )
    values (
      p_company_id,
      v_revision_id,
      nullif(v_item ->> 'purchase_allocation_id', '')::uuid,
      v_product.id,
      v_product.name,
      v_requested,
      (v_item ->> 'purchase_unit_id')::uuid,
      (v_item ->> 'pricing_unit_id')::uuid,
      nullif(v_item ->> 'comparison_unit_id', '')::uuid,
      nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
      v_agreed,
      nullif(v_item ->> 'notes', '')
    );
  end loop;

  perform private.emit_domain_event(
    p_company_id,
    'order.revision_created',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_revision_id', v_revision_id,
      'revision_number', v_revision_number
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_revision_id', v_revision_id,
    'revision_number', v_revision_number
  );
end;
$$;

create or replace function public.rpc_update_draft_order_revision(
  p_company_id uuid,
  p_order_revision_id uuid,
  p_items jsonb,
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_revision_status text;
  v_order_status text;
  v_item jsonb;
  v_item_id uuid;
  v_product record;
  v_requested numeric(18,6);
  v_agreed numeric(18,6);
  v_kept uuid[] := '{}';
  v_removed integer;
begin
  perform private.require_permission(p_company_id, 'order.update_draft');

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido deve possuir ao menos um item';
  end if;

  select r.order_id, r.status
  into v_order_id, v_revision_status
  from public.order_revisions r
  where r.id = p_order_revision_id
    and r.company_id = p_company_id
  for update;

  if v_order_id is null then
    raise exception 'Revisão inexistente';
  end if;

  if v_revision_status <> 'draft' then
    raise exception 'Somente revisão em rascunho pode ser editada';
  end if;

  select o.status
  into v_order_status
  from public.orders o
  where o.id = v_order_id
    and o.company_id = p_company_id
  for update;

  if v_order_status in ('received', 'cancelled') then
    raise exception 'Pedido encerrado não aceita edição';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := nullif(v_item ->> 'requested_quantity', '')::numeric;
    v_agreed := nullif(v_item ->> 'agreed_price', '')::numeric;

    if v_requested is null or v_requested <= 0
       or v_agreed < 0 then
      raise exception 'Quantidade ou preço inválido no rascunho';
    end if;

    v_item_id := nullif(v_item ->> 'id', '')::uuid;

    if v_item_id is not null then
      -- Atualiza no lugar: `purchase_allocation_id`, `product_id` e o
      -- snapshot do nome ficam intocados, que é o que liga este item à
      -- decisão de compra que o originou.
      update public.order_revision_items i
      set requested_quantity = v_requested,
          agreed_price = v_agreed,
          purchase_unit_id = (v_item ->> 'purchase_unit_id')::uuid,
          pricing_unit_id = (v_item ->> 'pricing_unit_id')::uuid,
          comparison_unit_id = nullif(v_item ->> 'comparison_unit_id', '')::uuid,
          estimated_pricing_quantity =
            nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
          notes = nullif(v_item ->> 'notes', '')
      where i.id = v_item_id
        and i.company_id = p_company_id
        and i.order_revision_id = p_order_revision_id;

      if not found then
        raise exception 'Item não pertence a esta revisão';
      end if;
    else
      select p.id, p.name
      into v_product
      from public.products p
      where p.id = (v_item ->> 'product_id')::uuid
        and p.company_id = p_company_id
        and p.is_active = true;

      if v_product.id is null then
        raise exception 'Produto inválido no rascunho';
      end if;

      insert into public.order_revision_items (
        company_id,
        order_revision_id,
        purchase_allocation_id,
        product_id,
        product_name_snapshot,
        requested_quantity,
        purchase_unit_id,
        pricing_unit_id,
        comparison_unit_id,
        estimated_pricing_quantity,
        agreed_price,
        notes
      )
      values (
        p_company_id,
        p_order_revision_id,
        null,
        v_product.id,
        v_product.name,
        v_requested,
        (v_item ->> 'purchase_unit_id')::uuid,
        (v_item ->> 'pricing_unit_id')::uuid,
        nullif(v_item ->> 'comparison_unit_id', '')::uuid,
        nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
        v_agreed,
        nullif(v_item ->> 'notes', '')
      )
      returning id into v_item_id;
    end if;

    v_kept := v_kept || v_item_id;
  end loop;

  delete from public.order_revision_items i
  where i.company_id = p_company_id
    and i.order_revision_id = p_order_revision_id
    and not (i.id = any(v_kept));

  get diagnostics v_removed = row_count;

  update public.order_revisions r
  set delivery_due_date = p_delivery_due_date
  where r.id = p_order_revision_id
    and r.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.draft_updated',
    'order',
    v_order_id,
    jsonb_build_object(
      'order_revision_id', p_order_revision_id,
      'item_count', jsonb_array_length(p_items),
      'items_removed', v_removed
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', p_order_revision_id,
    'item_count', jsonb_array_length(p_items)
  );
end;
$$;

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
    if v_unverified and v_revision_item.agreed_price is null then
      raise exception 'Pedido sem preço: informe o valor do espelho do pedido ou comprovante para receber';
    end if;
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

commit;
