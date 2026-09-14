-- Mercadoria que chega na nota sem estar no pedido não tinha onde entrar:
-- `receipt_items.order_revision_item_id` é NOT NULL, então tudo que é recebido
-- precisa apontar para uma linha do pedido. Na prática o comprador negocia na
-- entrega, pega itens a mais e a nota vem com mais linhas do que o pedido — e
-- a conferência nunca fechava.
--
-- O caminho existia, mas em três telas: revisar o pedido à mão, marcar como
-- enviado e confirmar manualmente. Marcar como enviado é falso — nada foi
-- enviado a fornecedor nenhum. Esta RPC faz o que de fato aconteceu: cria a
-- revisão já confirmada, porque a nota fiscal é a prova, e diz que a origem
-- da confirmação foi a nota, não uma conversa.

begin;

alter table public.order_revisions
  drop constraint if exists order_revisions_confirmation_source_check;

alter table public.order_revisions
  drop constraint if exists order_revisions_confirmation_source_check1;

do $$
declare
  v_constraint text;
begin
  select conname
  into v_constraint
  from pg_constraint
  where conrelid = 'public.order_revisions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%confirmation_source%'
    and pg_get_constraintdef(oid) like '%supplier_link%';

  if v_constraint is not null then
    execute format(
      'alter table public.order_revisions drop constraint %I',
      v_constraint
    );
  end if;
end;
$$;

alter table public.order_revisions
  add constraint order_revisions_confirmation_source_check check (
    confirmation_source is null
    or confirmation_source in ('supplier_link', 'manual', 'invoice')
  );

comment on column public.order_revisions.confirmation_source is
  'supplier_link: aceite pelo link. manual: confirmação recebida por fora. invoice: item acrescentado a partir da nota fiscal, que é a própria prova.';

/**
 * Acrescenta ao pedido um produto que veio na nota e não estava nele.
 *
 * A revisão nova nasce confirmada de propósito. O fluxo normal — rascunho,
 * enviado, confirmado — existe para combinar algo que ainda vai acontecer.
 * Aqui a mercadoria já está na doca e a nota já foi emitida: pedir
 * confirmação ao fornecedor do que ele acabou de faturar seria cerimônia, e
 * marcar como "enviado" registraria uma comunicação que nunca houve.
 */
create or replace function public.rpc_add_invoice_item_to_order(
  p_company_id uuid,
  p_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_price numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_current_revision record;
  v_product record;
  v_revision_number integer;
  v_revision_id uuid;
  v_notes text;
begin
  perform private.require_permission(p_company_id, 'order.revise');

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Informe a quantidade recebida';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Informe o preço da nota';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_notes), '');
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'A observação deve ter no máximo 500 caracteres';
  end if;

  select o.id, o.status, o.current_revision_id
  into v_order
  from public.orders o
  where o.company_id = p_company_id
    and o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.status = 'draft' then
    raise exception 'Pedido em rascunho: edite os itens direto no pedido';
  end if;
  if v_order.status not in (
    'awaiting_confirmation',
    'awaiting_delivery',
    'partially_received'
  ) then
    raise exception 'Pedido recebido ou cancelado não aceita itens novos';
  end if;
  if v_order.current_revision_id is null then
    raise exception 'Pedido sem revisão vigente';
  end if;

  -- Duas revisões vivas disputariam qual é a verdade do pedido.
  if exists (
    select 1
    from public.order_revisions r
    where r.company_id = p_company_id
      and r.order_id = p_order_id
      and r.status = 'draft'
  ) then
    raise exception 'Há uma revisão em preparação neste pedido. Termine aquela primeiro';
  end if;

  select r.id, r.delivery_due_date
  into v_current_revision
  from public.order_revisions r
  where r.company_id = p_company_id
    and r.id = v_order.current_revision_id
  for update;

  -- Produto que já está no pedido não é item novo: é quantidade acima do
  -- combinado, e para isso existe a divergência comercial.
  if exists (
    select 1
    from public.order_revision_items item
    where item.company_id = p_company_id
      and item.order_revision_id = v_current_revision.id
      and item.product_id = p_product_id
  ) then
    raise exception 'Este produto já está no pedido. Ajuste a quantidade recebida em vez de acrescentá-lo';
  end if;

  -- Sem exigir `is_active`: a nota é prova de que a compra aconteceu, e travar
  -- aqui deixaria o recebimento sem como fechar por causa do cadastro.
  select p.id, p.name, p.purchase_unit_id, p.pricing_unit_id, p.comparison_unit_id
  into v_product
  from public.products p
  where p.company_id = p_company_id
    and p.id = p_product_id;

  if not found then
    raise exception 'Produto não encontrado nesta empresa';
  end if;

  select coalesce(max(r.revision_number), 0) + 1
  into v_revision_number
  from public.order_revisions r
  where r.company_id = p_company_id
    and r.order_id = p_order_id;

  insert into public.order_revisions (
    company_id,
    order_id,
    revision_number,
    status,
    delivery_due_date,
    created_by,
    confirmed_at,
    confirmation_source,
    confirmed_by
  )
  values (
    p_company_id,
    p_order_id,
    v_revision_number,
    'confirmed',
    v_current_revision.delivery_due_date,
    auth.uid(),
    now(),
    'invoice',
    auth.uid()
  )
  returning id into v_revision_id;

  -- A revisão é o retrato inteiro do pedido, não o delta: tudo que já estava
  -- vem junto, com o vínculo da alocação que originou cada linha.
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
    estimated_pricing_source,
    agreed_price,
    notes
  )
  select
    p_company_id,
    v_revision_id,
    item.purchase_allocation_id,
    item.product_id,
    item.product_name_snapshot,
    item.requested_quantity,
    item.purchase_unit_id,
    item.pricing_unit_id,
    item.comparison_unit_id,
    item.estimated_pricing_quantity,
    item.estimated_pricing_source,
    item.agreed_price,
    item.notes
  from public.order_revision_items item
  where item.company_id = p_company_id
    and item.order_revision_id = v_current_revision.id;

  insert into public.order_revision_items (
    company_id,
    order_revision_id,
    product_id,
    product_name_snapshot,
    requested_quantity,
    purchase_unit_id,
    pricing_unit_id,
    comparison_unit_id,
    estimated_pricing_quantity,
    estimated_pricing_source,
    agreed_price,
    notes
  )
  values (
    p_company_id,
    v_revision_id,
    v_product.id,
    v_product.name,
    p_quantity,
    v_product.purchase_unit_id,
    v_product.pricing_unit_id,
    v_product.comparison_unit_id,
    case
      when v_product.purchase_unit_id = v_product.pricing_unit_id
      then p_quantity
    end,
    case
      when v_product.purchase_unit_id = v_product.pricing_unit_id
      then 'same_unit'
      else 'unavailable'
    end,
    p_price,
    v_notes
  );

  update public.order_revisions
  set status = 'superseded'
  where company_id = p_company_id
    and order_id = p_order_id
    and id <> v_revision_id
    and status in ('confirmed', 'contested');

  update public.orders
  set current_revision_id = v_revision_id,
      -- Aguardando confirmação deixa de fazer sentido quando a nota chegou.
      status = case
        when status = 'awaiting_confirmation' then 'awaiting_delivery'
        else status
      end
  where company_id = p_company_id
    and id = p_order_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.invoice_item_added',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_revision_id', v_revision_id,
      'revision_number', v_revision_number,
      'product_id', v_product.id,
      'quantity', p_quantity,
      'price', p_price
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_revision_id', v_revision_id,
    'revision_number', v_revision_number
  );
end;
$$;

revoke all on function public.rpc_add_invoice_item_to_order(
  uuid, uuid, uuid, numeric, numeric, text
) from public, anon;
grant execute on function public.rpc_add_invoice_item_to_order(
  uuid, uuid, uuid, numeric, numeric, text
) to authenticated;

commit;
