-- 0043_receiving_inbox_and_arrival.sql
-- Separa a chegada física da conferência que efetiva quantidades e valores.

begin;

alter table public.receipts
  add column invoice_number text,
  add column invoice_series text,
  add column invoice_total numeric(18,2),
  add column checked_by uuid references auth.users(id) on delete set null,
  add column checked_at timestamptz,
  add constraint receipts_invoice_number_length
    check (invoice_number is null or char_length(invoice_number) <= 60),
  add constraint receipts_invoice_series_length
    check (invoice_series is null or char_length(invoice_series) <= 20),
  add constraint receipts_invoice_total_nonnegative
    check (invoice_total is null or invoice_total >= 0);

-- Uma entrega precisa ser conferida antes de outra chegada do mesmo pedido ser
-- aberta. Depois de postada, uma entrega parcial pode gerar um novo rascunho.
create unique index receipts_one_draft_per_order_uidx
on public.receipts(company_id, order_id)
where status = 'draft';

-- Chegada é uma operação curta: registra o fato sem mexer no saldo do pedido.
create or replace function public.rpc_register_order_arrival(
  p_company_id uuid,
  p_order_id uuid,
  p_received_at timestamptz default null,
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
  v_receipt_id uuid;
  v_revision_id uuid;
  v_status text;
begin
  perform private.require_permission(p_company_id, 'receipt.create');

  select o.current_revision_id, o.status
  into v_revision_id, v_status
  from public.orders o
  where o.id = p_order_id and o.company_id = p_company_id
  for update;

  if v_revision_id is null or v_status not in ('awaiting_delivery', 'partially_received') then
    raise exception 'Pedido não está aguardando entrega';
  end if;

  if not exists (
    select 1 from public.order_revisions r
    where r.id = v_revision_id and r.company_id = p_company_id
      and r.order_id = p_order_id and r.status = 'confirmed'
  ) then
    raise exception 'Revisão vigente ainda não foi confirmada pelo fornecedor';
  end if;

  if exists (
    select 1 from public.receipts r
    where r.company_id = p_company_id and r.order_id = p_order_id
      and r.status = 'draft'
  ) then
    raise exception 'Este pedido já possui uma chegada aguardando conferência';
  end if;

  insert into public.receipts (
    company_id, order_id, status, received_at, received_by,
    invoice_number, invoice_series, invoice_total, notes
  ) values (
    p_company_id, p_order_id, 'draft', coalesce(p_received_at, now()), auth.uid(),
    nullif(btrim(p_invoice_number), ''), nullif(btrim(p_invoice_series), ''),
    p_invoice_total, nullif(btrim(p_notes), '')
  ) returning id into v_receipt_id;

  perform private.emit_domain_event(
    p_company_id,
    'receipt.arrived',
    'receipt',
    v_receipt_id,
    jsonb_build_object('order_id', p_order_id)
  );

  return jsonb_build_object('receipt_id', v_receipt_id, 'order_id', p_order_id);
end;
$$;

-- Finaliza um rascunho já aberto. Todo o lançamento, divergências e mudança
-- do pedido acontecem na mesma transação.
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

    if v_logistic is null or v_logistic <= 0
       or v_pricing is null or v_pricing < 0
       or v_practiced is null or v_practiced < 0 then
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
      practiced_price, notes
    ) values (
      p_company_id, p_receipt_id, v_revision_item.id,
      v_logistic, v_pricing, v_practiced,
      nullif(v_item ->> 'notes', '')
    ) returning id into v_receipt_item_id;

    if v_practiced <> v_revision_item.agreed_price then
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

revoke all on function public.rpc_register_order_arrival(uuid,uuid,timestamptz,text,text,numeric,text)
  from public, anon;
grant execute on function public.rpc_register_order_arrival(uuid,uuid,timestamptz,text,text,numeric,text)
  to authenticated;

revoke all on function public.rpc_post_draft_receipt(uuid,uuid,jsonb,text,text,numeric,text)
  from public, anon;
grant execute on function public.rpc_post_draft_receipt(uuid,uuid,jsonb,text,text,numeric,text)
  to authenticated;

-- As notificações passam a apontar para a fila operacional de recebimento.
create or replace function private.fanout_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission text;
  v_title text;
  v_message text;
  v_priority text := 'normal';
  v_action_url text;
  v_order_id uuid;
  v_round_id uuid;
  v_order_number bigint;
  v_notify_actor boolean := false;
begin
  case new.event_type
    when 'quotation.response_submitted' then
      v_permission := 'purchase_round.view';
      v_title := 'Fornecedor respondeu a cotacao';
      v_message := coalesce(new.payload ->> 'answered_items', '?') || ' de ' ||
                   coalesce(new.payload ->> 'total_items', '?') || ' itens respondidos';
      select rs.purchase_round_id into v_round_id
      from public.round_suppliers rs
      where rs.id = new.aggregate_id and rs.company_id = new.company_id;
      v_action_url := '/compras/' || coalesce(v_round_id::text, '');

    when 'order.confirmed' then
      v_permission := 'receipt.view';
      v_title := 'Nova entrega prevista';
      v_message := 'O fornecedor confirmou o pedido; confira produtos, quantidades e prazo.';
      v_action_url := '/recebimentos';

    when 'receipt.arrived' then
      v_permission := 'receipt.post';
      select o.order_number into v_order_number
      from public.orders o
      where o.id = (new.payload ->> 'order_id')::uuid
        and o.company_id = new.company_id;
      v_title := 'Mercadoria aguardando conferencia';
      v_message := 'A chegada do pedido #' || coalesce(v_order_number::text, '?') ||
                   ' foi registrada.';
      v_action_url := '/recebimentos/' || new.aggregate_id::text;

    when 'order.divergence_created' then
      v_permission := 'order.revise';
      v_priority := 'high';
      v_title := 'Fornecedor apontou divergencia no pedido';
      v_message := coalesce(new.payload ->> 'count', '1') ||
                   ' ponto(s) a resolver antes da entrega.';
      v_action_url := '/pedidos/' || new.aggregate_id::text;

    when 'commercial_divergence.detected' then
      v_permission := 'commercial_divergence.manage';
      v_priority := 'high';
      v_notify_actor := true;
      v_title := 'Preco da nota diferente do combinado';
      v_message := 'Combinado ' || coalesce(new.payload ->> 'agreed_price', '?') ||
                   ', praticado ' || coalesce(new.payload ->> 'practiced_price', '?') || '.';
      select r.order_id into v_order_id
      from public.receipt_items ri
      join public.receipts r
        on r.id = ri.receipt_id and r.company_id = ri.company_id
      where ri.id = new.aggregate_id and ri.company_id = new.company_id;
      v_action_url := '/pedidos/' || coalesce(v_order_id::text, '');

    else
      return new;
  end case;

  insert into public.notifications (
    company_id, user_id, type, title, message, priority,
    resource_type, resource_id, action_url, metadata
  )
  select new.company_id, m.user_id, new.event_type, v_title, v_message,
    v_priority, new.aggregate_type, new.aggregate_id, v_action_url, new.payload
  from private.members_with_permission(new.company_id, v_permission) m
  where v_notify_actor or new.actor_user_id is null or m.user_id <> new.actor_user_id;

  return new;
end;
$$;

revoke all on function private.fanout_notification() from public, anon, authenticated;

commit;
