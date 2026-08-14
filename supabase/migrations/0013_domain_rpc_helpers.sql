-- 0013_domain_rpc_helpers.sql
-- Helpers e RPCs transacionais para operações internas autenticadas.
--
-- IMPORTANTE:
-- Funções SECURITY DEFINER abaixo fazem validação explícita de membership,
-- permissão e estado. A lógica crítica não depende de UPDATEs soltos do frontend.

begin;

-- ============================================================
-- HELPERS INTERNOS
-- ============================================================

create or replace function private.require_permission(
  target_company_id uuid,
  permission_key text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  if not private.has_permission(target_company_id, permission_key) then
    raise exception 'Permissão negada: %', permission_key using errcode = '42501';
  end if;
end;
$$;

create or replace function private.emit_domain_event(
  p_company_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_actor_type text default 'user',
  p_actor_user_id uuid default null,
  p_actor_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_user_id uuid;
begin
  v_user_id := case
    when p_actor_type = 'user' then coalesce(p_actor_user_id, auth.uid())
    else p_actor_user_id
  end;

  insert into public.domain_events (
    company_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_type,
    actor_user_id,
    actor_supplier_id,
    payload
  )
  values (
    p_company_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_actor_type,
    v_user_id,
    p_actor_supplier_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.require_permission(uuid, text) from public, anon, authenticated;
revoke all on function private.emit_domain_event(uuid,text,text,uuid,jsonb,text,uuid,uuid)
  from public, anon, authenticated;

-- ============================================================
-- RPC: REGISTRAR NEGOCIAÇÃO
-- ============================================================

create or replace function public.rpc_record_negotiation(
  p_company_id uuid,
  p_quotation_response_item_id uuid,
  p_new_price numeric,
  p_channel text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_price numeric(18,6);
  v_negotiation_id uuid;
begin
  perform private.require_permission(p_company_id, 'negotiation.create');

  if p_new_price is null or p_new_price < 0 then
    raise exception 'Preço negociado inválido';
  end if;

  if p_channel not in ('phone','whatsapp','in_person','other') then
    raise exception 'Canal de negociação inválido';
  end if;

  -- Último preço negociado; na ausência, preço original.
  select coalesce(
    (
      select n.new_price
      from public.negotiations n
      where n.company_id = p_company_id
        and n.quotation_response_item_id = p_quotation_response_item_id
      order by n.created_at desc, n.id desc
      limit 1
    ),
    qri.quoted_price
  )
  into v_previous_price
  from public.quotation_response_items qri
  where qri.id = p_quotation_response_item_id
    and qri.company_id = p_company_id;

  if v_previous_price is null then
    raise exception 'Item de resposta inexistente ou sem preço cotado';
  end if;

  insert into public.negotiations (
    company_id,
    quotation_response_item_id,
    previous_price,
    new_price,
    channel,
    notes,
    negotiated_by
  )
  values (
    p_company_id,
    p_quotation_response_item_id,
    v_previous_price,
    p_new_price,
    p_channel,
    p_notes,
    auth.uid()
  )
  returning id into v_negotiation_id;

  perform private.emit_domain_event(
    p_company_id,
    'negotiation.created',
    'quotation_response_item',
    p_quotation_response_item_id,
    jsonb_build_object(
      'negotiation_id', v_negotiation_id,
      'previous_price', v_previous_price,
      'new_price', p_new_price,
      'channel', p_channel
    )
  );

  return jsonb_build_object(
    'negotiation_id', v_negotiation_id,
    'previous_price', v_previous_price,
    'new_price', p_new_price
  );
end;
$$;

revoke all on function public.rpc_record_negotiation(uuid,uuid,numeric,text,text) from public;
grant execute on function public.rpc_record_negotiation(uuid,uuid,numeric,text,text)
to authenticated;

-- ============================================================
-- RPC: CONFIRMAR ALOCAÇÕES E GERAR PEDIDOS/REVISÕES EM RASCUNHO
--
-- Comunicação externa NÃO acontece aqui. O backend recebe os pedidos
-- criados, gera tokens, envia pela Evolution e só depois marca a revisão
-- como enviada.
-- ============================================================

create or replace function public.rpc_confirm_allocations_generate_orders(
  p_company_id uuid,
  p_purchase_round_id uuid,
  p_allocation_ids uuid[],
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier record;
  v_order_id uuid;
  v_revision_id uuid;
  v_created_orders jsonb := '[]'::jsonb;
  v_alloc_count integer;
begin
  perform private.require_permission(p_company_id, 'purchase_allocation.confirm');
  perform private.require_permission(p_company_id, 'order.create');

  if p_allocation_ids is null or cardinality(p_allocation_ids) = 0 then
    raise exception 'Nenhuma alocação informada';
  end if;

  if not exists (
    select 1
    from public.purchase_rounds pr
    where pr.id = p_purchase_round_id
      and pr.company_id = p_company_id
      and pr.status = 'active'
  ) then
    raise exception 'Rodada inexistente ou não está ativa';
  end if;

  select count(*)
  into v_alloc_count
  from public.purchase_allocations pa
  where pa.company_id = p_company_id
    and pa.purchase_round_id = p_purchase_round_id
    and pa.id = any(p_allocation_ids)
    and pa.status = 'draft';

  if v_alloc_count <> cardinality(p_allocation_ids) then
    raise exception 'Uma ou mais alocações são inválidas, não pertencem à rodada ou já foram confirmadas';
  end if;

  for v_supplier in
    select distinct pa.supplier_id
    from public.purchase_allocations pa
    where pa.company_id = p_company_id
      and pa.purchase_round_id = p_purchase_round_id
      and pa.id = any(p_allocation_ids)
      and pa.status = 'draft'
    order by pa.supplier_id
  loop
    insert into public.orders (
      company_id,
      supplier_id,
      purchase_round_id,
      origin,
      status,
      created_by
    )
    values (
      p_company_id,
      v_supplier.supplier_id,
      p_purchase_round_id,
      'purchase_round',
      'draft',
      auth.uid()
    )
    returning id into v_order_id;

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
      v_order_id,
      1,
      'draft',
      p_delivery_due_date,
      auth.uid()
    )
    returning id into v_revision_id;

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
    select
      p_company_id,
      v_revision_id,
      pa.id,
      qi.product_id,
      p.name,
      pa.allocated_quantity,
      qi.purchase_unit_id,
      qi.pricing_unit_id,
      qi.comparison_unit_id,
      pa.estimated_pricing_quantity,
      pa.selected_price,
      pa.decision_notes
    from public.purchase_allocations pa
    join public.quotation_items qi
      on qi.id = pa.quotation_item_id
     and qi.company_id = pa.company_id
    join public.products p
      on p.id = qi.product_id
     and p.company_id = qi.company_id
    where pa.company_id = p_company_id
      and pa.purchase_round_id = p_purchase_round_id
      and pa.supplier_id = v_supplier.supplier_id
      and pa.id = any(p_allocation_ids)
      and pa.status = 'draft';

    update public.orders
    set current_revision_id = v_revision_id
    where id = v_order_id
      and company_id = p_company_id;

    update public.purchase_allocations
    set status = 'confirmed'
    where company_id = p_company_id
      and purchase_round_id = p_purchase_round_id
      and supplier_id = v_supplier.supplier_id
      and id = any(p_allocation_ids)
      and status = 'draft';

    update public.quotation_items qi
    set commercial_status = 'confirmed'
    where qi.company_id = p_company_id
      and qi.id in (
        select pa.quotation_item_id
        from public.purchase_allocations pa
        where pa.company_id = p_company_id
          and pa.purchase_round_id = p_purchase_round_id
          and pa.supplier_id = v_supplier.supplier_id
          and pa.id = any(p_allocation_ids)
      );

    perform private.emit_domain_event(
      p_company_id,
      'order.created',
      'order',
      v_order_id,
      jsonb_build_object(
        'order_revision_id', v_revision_id,
        'supplier_id', v_supplier.supplier_id,
        'purchase_round_id', p_purchase_round_id
      )
    );

    v_created_orders := v_created_orders || jsonb_build_array(
      jsonb_build_object(
        'order_id', v_order_id,
        'order_revision_id', v_revision_id,
        'supplier_id', v_supplier.supplier_id
      )
    );
  end loop;

  perform private.emit_domain_event(
    p_company_id,
    'purchase.allocations_confirmed',
    'purchase_round',
    p_purchase_round_id,
    jsonb_build_object(
      'allocation_ids', to_jsonb(p_allocation_ids),
      'orders', v_created_orders
    )
  );

  return jsonb_build_object(
    'purchase_round_id', p_purchase_round_id,
    'orders', v_created_orders
  );
end;
$$;

revoke all on function public.rpc_confirm_allocations_generate_orders(uuid,uuid,uuid[],date)
from public;
grant execute on function public.rpc_confirm_allocations_generate_orders(uuid,uuid,uuid[],date)
to authenticated;

-- ============================================================
-- RPC: CRIAR PEDIDO DIRETO EM RASCUNHO
--
-- p_items: array JSON:
-- [{
--   "product_id": "...",
--   "requested_quantity": 2,
--   "purchase_unit_id": "...",
--   "pricing_unit_id": "...",
--   "comparison_unit_id": null,
--   "estimated_pricing_quantity": 84,
--   "agreed_price": 49.00,
--   "notes": null
-- }]
-- ============================================================

create or replace function public.rpc_create_direct_order(
  p_company_id uuid,
  p_supplier_id uuid,
  p_delivery_due_date date,
  p_items jsonb
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
       or v_agreed is null or v_agreed < 0 then
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

revoke all on function public.rpc_create_direct_order(uuid,uuid,date,jsonb) from public;
grant execute on function public.rpc_create_direct_order(uuid,uuid,date,jsonb)
to authenticated;

-- ============================================================
-- RPC: CRIAR NOVA REVISÃO DE PEDIDO
-- ============================================================

create or replace function public.rpc_create_order_revision(
  p_company_id uuid,
  p_order_id uuid,
  p_delivery_due_date date,
  p_items jsonb
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
       or v_agreed is null or v_agreed < 0 then
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

revoke all on function public.rpc_create_order_revision(uuid,uuid,date,jsonb) from public;
grant execute on function public.rpc_create_order_revision(uuid,uuid,date,jsonb)
to authenticated;

-- ============================================================
-- RPC: MARCAR REVISÃO COMO ENVIADA
-- Deve ser chamada APÓS sucesso real do envio externo.
-- ============================================================

create or replace function public.rpc_mark_order_revision_sent(
  p_company_id uuid,
  p_order_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_status text;
begin
  perform private.require_permission(p_company_id, 'order.send');

  select r.order_id, r.status
  into v_order_id, v_status
  from public.order_revisions r
  where r.id = p_order_revision_id
    and r.company_id = p_company_id
  for update;

  if v_order_id is null then
    raise exception 'Revisão inexistente';
  end if;

  if v_status = 'sent' then
    return jsonb_build_object(
      'order_id', v_order_id,
      'order_revision_id', p_order_revision_id,
      'status', 'sent'
    );
  end if;

  if v_status <> 'draft' then
    raise exception 'Somente revisão em rascunho pode ser marcada como enviada';
  end if;

  update public.order_revisions
  set status = 'sent',
      sent_at = now()
  where id = p_order_revision_id
    and company_id = p_company_id;

  update public.orders
  set current_revision_id = p_order_revision_id,
      status = 'awaiting_confirmation'
  where id = v_order_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.sent',
    'order',
    v_order_id,
    jsonb_build_object('order_revision_id', p_order_revision_id)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', p_order_revision_id,
    'status', 'sent'
  );
end;
$$;

revoke all on function public.rpc_mark_order_revision_sent(uuid,uuid) from public;
grant execute on function public.rpc_mark_order_revision_sent(uuid,uuid)
to authenticated;

-- ============================================================
-- RPC: REGISTRAR RECEBIMENTO POSTADO
--
-- p_items:
-- [{
--   "order_revision_item_id":"...",
--   "logistic_quantity_received":20,
--   "pricing_quantity_received":563.8,
--   "practiced_price":12.10,
--   "notes":null
-- }]
-- ============================================================

create or replace function public.rpc_post_receipt(
  p_company_id uuid,
  p_order_id uuid,
  p_received_at timestamptz,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_current_revision_id uuid;
  v_order_status text;
  v_item jsonb;
  v_revision_item record;
  v_receipt_item_id uuid;
  v_logistic numeric(18,6);
  v_pricing numeric(18,6);
  v_practiced numeric(18,6);
  v_complete boolean;
begin
  perform private.require_permission(p_company_id, 'receipt.create');

  select o.current_revision_id, o.status
  into v_current_revision_id, v_order_status
  from public.orders o
  where o.id = p_order_id
    and o.company_id = p_company_id
  for update;

  if v_current_revision_id is null then
    raise exception 'Pedido não possui revisão vigente';
  end if;

  if v_order_status not in ('awaiting_delivery','partially_received') then
    raise exception 'Pedido não está aguardando recebimento';
  end if;

  if not exists (
    select 1
    from public.order_revisions r
    where r.id = v_current_revision_id
      and r.company_id = p_company_id
      and r.order_id = p_order_id
      and r.status = 'confirmed'
  ) then
    raise exception 'Revisão vigente ainda não foi confirmada pelo fornecedor';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Recebimento deve possuir ao menos um item';
  end if;

  insert into public.receipts (
    company_id,
    order_id,
    status,
    received_at,
    received_by,
    notes
  )
  values (
    p_company_id,
    p_order_id,
    'posted',
    coalesce(p_received_at, now()),
    auth.uid(),
    p_notes
  )
  returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_logistic := nullif(v_item ->> 'logistic_quantity_received', '')::numeric;
    v_pricing := nullif(v_item ->> 'pricing_quantity_received', '')::numeric;
    v_practiced := nullif(v_item ->> 'practiced_price', '')::numeric;

    if v_logistic is null or v_logistic < 0
       or v_pricing is null or v_pricing < 0
       or v_practiced is null or v_practiced < 0 then
      raise exception 'Dados inválidos no recebimento';
    end if;

    select ori.*
    into v_revision_item
    from public.order_revision_items ori
    where ori.id = (v_item ->> 'order_revision_item_id')::uuid
      and ori.company_id = p_company_id
      and ori.order_revision_id = v_current_revision_id;

    if v_revision_item.id is null then
      raise exception 'Item não pertence à revisão vigente do pedido';
    end if;

    insert into public.receipt_items (
      company_id,
      receipt_id,
      order_revision_item_id,
      logistic_quantity_received,
      pricing_quantity_received,
      practiced_price,
      notes
    )
    values (
      p_company_id,
      v_receipt_id,
      v_revision_item.id,
      v_logistic,
      v_pricing,
      v_practiced,
      nullif(v_item ->> 'notes', '')
    )
    returning id into v_receipt_item_id;

    if v_practiced <> v_revision_item.agreed_price then
      insert into public.commercial_divergences (
        company_id,
        supplier_id,
        order_id,
        order_revision_item_id,
        receipt_item_id,
        type,
        agreed_value,
        realized_value,
        financial_impact,
        status,
        created_by
      )
      select
        p_company_id,
        o.supplier_id,
        p_order_id,
        v_revision_item.id,
        v_receipt_item_id,
        'price',
        jsonb_build_object('price', v_revision_item.agreed_price),
        jsonb_build_object('price', v_practiced),
        (v_practiced - v_revision_item.agreed_price) * v_pricing,
        'pending',
        auth.uid()
      from public.orders o
      where o.id = p_order_id
        and o.company_id = p_company_id;

      perform private.emit_domain_event(
        p_company_id,
        'commercial_divergence.detected',
        'receipt_item',
        v_receipt_item_id,
        jsonb_build_object(
          'type', 'price',
          'agreed_price', v_revision_item.agreed_price,
          'practiced_price', v_practiced,
          'pricing_quantity_received', v_pricing
        )
      );
    end if;
  end loop;

  select not exists (
    select 1
    from public.order_revision_items ori
    where ori.order_revision_id = v_current_revision_id
      and ori.company_id = p_company_id
      and coalesce((
        select sum(ri.logistic_quantity_received)
        from public.receipt_items ri
        join public.receipts r
          on r.id = ri.receipt_id
         and r.company_id = ri.company_id
        where ri.order_revision_item_id = ori.id
          and ri.company_id = p_company_id
          and r.status = 'posted'
      ), 0) < ori.requested_quantity
  )
  into v_complete;

  update public.orders
  set status = case when v_complete then 'received' else 'partially_received' end,
      completed_at = case when v_complete then now() else null end
  where id = p_order_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'receipt.posted',
    'order',
    p_order_id,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'complete', v_complete
    )
  );

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'order_id', p_order_id,
    'order_status', case when v_complete then 'received' else 'partially_received' end
  );
end;
$$;

revoke all on function public.rpc_post_receipt(uuid,uuid,timestamptz,jsonb,text) from public;
grant execute on function public.rpc_post_receipt(uuid,uuid,timestamptz,jsonb,text)
to authenticated;

-- ============================================================
-- RPC: ENCERRAR SALDO QUE NÃO SERÁ ENTREGUE
-- Não altera quantidades históricas; apenas encerra o pedido explicitamente.
-- ============================================================

create or replace function public.rpc_close_order_balance(
  p_company_id uuid,
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo é obrigatório para encerrar saldo';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.company_id = p_company_id
      and o.status in ('awaiting_delivery','partially_received')
  ) then
    raise exception 'Pedido não possui saldo passível de encerramento';
  end if;

  update public.orders
  set status = 'received',
      completed_at = now()
  where id = p_order_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.balance_closed',
    'order',
    p_order_id,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'received',
    'balance_closed', true
  );
end;
$$;

revoke all on function public.rpc_close_order_balance(uuid,uuid,text) from public;
grant execute on function public.rpc_close_order_balance(uuid,uuid,text)
to authenticated;

commit;
