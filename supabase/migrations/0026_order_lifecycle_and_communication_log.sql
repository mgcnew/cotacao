-- 0026_order_lifecycle_and_communication_log.sql
--
-- APLICADA em 2026-08-16.
--
-- PROBLEMA
-- Tres capacidades que o sistema promete e nao entrega.
--
-- 1. `order.cancel` esta no seed de permissoes (0005) e o status 'cancelled'
--    esta no CHECK de `orders` (0010). Nenhuma RPC produz a transicao: o
--    status e inalcancavel e a permissao nao autoriza nada.
--
-- 2. `order.update_draft` idem. Pior: um pedido recem criado nasce com a
--    revisao 1 em rascunho, e `rpc_create_order_revision` recusa criar outra
--    enquanto houver rascunho aberto -- entao errar a quantidade ao gerar o
--    pedido nao tem conserto nenhum pelo app.
--
-- 3. `communication_logs` (0012) tem canal, provider, status, id externo e
--    erro, e nunca recebeu uma linha. `authenticated` so tem SELECT -- decisao
--    correta, igual a de `notifications`: quem escreve e o backend. Faltava
--    quem escreve.
--
-- SOLUCAO
-- Tres RPCs. As duas primeiras sao do usuario e checam permissao por dentro;
-- a terceira e do backend e so service_role executa, no mesmo desenho de
-- `rpc_service_store_public_token` (0017).
--
-- CANCELAMENTO
-- `rpc_public_confirm_order` (0014) valida o status da REVISAO e verifica se
-- ela e a vigente -- nunca olha `orders.status`. Cancelar so o pedido deixaria
-- o link do fornecedor funcionando: ele confirmaria um pedido cancelado e o
-- traria de volta para 'awaiting_delivery'. Por isso cancelar faz as tres
-- coisas na mesma transacao: cancela as revisoes vivas, revoga os tokens
-- (`resolve_public_token` filtra `revoked_at is null`) e fecha as divergencias
-- pendentes.
--
-- Recebimento ja registrado bloqueia o cancelamento: aquilo ja entrou no
-- estoque e no financeiro. O caminho correto passa a ser encerrar saldo, que
-- e `rpc_close_order_balance` e preserva os numeros recebidos.
--
-- As alocacoes de origem seguem 'confirmed'. Elas registram a decisao de
-- compra, que de fato aconteceu; o cancelamento e um fato posterior, e os dois
-- ficam no historico -- que e a regra central do documento mestre (secao 19).
--
-- EDICAO DE RASCUNHO
-- O guard e o status da REVISAO, nao o do pedido: uma revisao 2 em rascunho de
-- um pedido ja enviado tambem nunca saiu, e a secao 16.11 do documento mestre
-- ("antes da comunicacao externa: edicao direta") vale para ela igualmente.
--
-- Item existente e identificado por `id` no payload e atualizado no lugar, em
-- vez de apagar e reinserir tudo. Isso preserva `purchase_allocation_id`, que
-- e o fio entre a alocacao e o item pedido -- sem ele, um pedido nascido de
-- rodada perderia a rastreabilidade ao ser corrigido. Item sem `id` e novo;
-- item que sumiu do payload e removido.
--
-- Nao ha risco de remover item ja recebido: `receipt_items` so existe depois
-- do envio e da confirmacao, e a revisao aqui esta em rascunho.
--
-- VERIFICADO apos aplicar, com JWT real e rollback:
--   editar rascunho              qtd/preco/obs/prazo aplicados
--                                purchase_allocation_id e snapshot preservados
--   trocar itens do rascunho     antigo removido, novo inserido (allocation null)
--   item de outra revisao        RECUSADO 'Item nao pertence a esta revisao'
--   editar revisao ja enviada    RECUSADO 'Somente revisao em rascunho...'
--   editar pedido cancelado      RECUSADO
--   cancelar sem motivo          RECUSADO
--   cancelar sem a permissao     RECUSADO 42501 'Permissao negada: order.cancel'
--   cancelar com recebimento     RECUSADO, aponta encerrar saldo
--   cancelar awaiting_confirmation
--                                pedido cancelled + cancelled_at,
--                                revisao 1 cancelled, token revogado
--   cancelar duas vezes          idempotente, sem novo evento
--   log de comunicacao           authenticated RECUSADO 42501,
--                                service_role queued -> sent com id externo
--   canal invalido               RECUSADO

begin;

-- ============================================================
-- RPC: CANCELAR PEDIDO
-- ============================================================

create or replace function public.rpc_cancel_order(
  p_company_id uuid,
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reason text;
  v_revisions integer;
begin
  perform private.require_permission(p_company_id, 'order.cancel');

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  select o.status
  into v_status
  from public.orders o
  where o.id = p_order_id
    and o.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Pedido inexistente';
  end if;

  if v_status = 'cancelled' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
  end if;

  if v_status = 'received' then
    raise exception 'Pedido já recebido não pode ser cancelado';
  end if;

  if exists (
    select 1
    from public.receipts r
    where r.order_id = p_order_id
      and r.company_id = p_company_id
      and r.status <> 'voided'
  ) then
    raise exception 'Pedido possui recebimento registrado; encerre o saldo em vez de cancelar';
  end if;

  -- Revogar antes de cancelar as revisões: enquanto o token vale, o
  -- fornecedor consegue confirmar por fora desta transação.
  update public.public_access_tokens t
  set revoked_at = now()
  where t.company_id = p_company_id
    and t.purpose = 'order_confirmation'
    and t.revoked_at is null
    and t.order_revision_id in (
      select r.id
      from public.order_revisions r
      where r.order_id = p_order_id
        and r.company_id = p_company_id
    );

  update public.order_revisions r
  set status = 'cancelled'
  where r.order_id = p_order_id
    and r.company_id = p_company_id
    and r.status in ('draft', 'sent', 'confirmed', 'contested');

  get diagnostics v_revisions = row_count;

  update public.order_divergences d
  set status = 'cancelled',
      resolved_by = auth.uid(),
      resolved_at = now()
  where d.order_id = p_order_id
    and d.company_id = p_company_id
    and d.status = 'pending';

  update public.orders o
  set status = 'cancelled',
      cancelled_at = now()
  where o.id = p_order_id
    and o.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.cancelled',
    'order',
    p_order_id,
    jsonb_build_object(
      'previous_status', v_status,
      'reason', v_reason,
      'revisions_cancelled', v_revisions
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'previous_status', v_status
  );
end;
$$;

revoke all on function public.rpc_cancel_order(uuid, uuid, text)
  from public, anon;
grant execute on function public.rpc_cancel_order(uuid, uuid, text)
  to authenticated;

comment on function public.rpc_cancel_order(uuid, uuid, text)
is 'Cancela pedido sem recebimento: cancela revisões vivas, revoga tokens do fornecedor e fecha divergências pendentes.';

-- ============================================================
-- RPC: EDITAR REVISÃO EM RASCUNHO
--
-- p_items:
-- [{
--   "id": "<order_revision_item_id>" | null,   -- null = item novo
--   "product_id": "...",                        -- exigido só quando id é null
--   "requested_quantity": 400,
--   "purchase_unit_id": "...",
--   "pricing_unit_id": "...",
--   "comparison_unit_id": null,
--   "estimated_pricing_quantity": null,
--   "agreed_price": 12.00,
--   "notes": null
-- }]
--
-- `p_delivery_due_date` vem por último e com default: prazo é opcional, e o
-- gerador de tipos do Supabase lê parâmetro sem default como obrigatório e não
-- nulo. Mesma convenção da 0027 — em SQL, parâmetro com default não pode
-- preceder parâmetro sem.
-- ============================================================

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
       or v_agreed is null or v_agreed < 0 then
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

revoke all on function public.rpc_update_draft_order_revision(uuid, uuid, jsonb, date)
  from public, anon;
grant execute on function public.rpc_update_draft_order_revision(uuid, uuid, jsonb, date)
  to authenticated;

comment on function public.rpc_update_draft_order_revision(uuid, uuid, jsonb, date)
is 'Substitui itens e prazo de uma revisão em rascunho, preservando o vínculo com a alocação de origem dos itens mantidos.';

-- ============================================================
-- REGISTRO DE COMUNICAÇÃO
-- Apenas service_role possui EXECUTE: quem envia é o backend.
-- ============================================================

create or replace function public.rpc_service_log_communication(
  p_company_id uuid,
  p_supplier_id uuid,
  p_channel text,
  p_provider text,
  p_status text,
  p_supplier_contact_id uuid default null,
  p_round_supplier_id uuid default null,
  p_order_revision_id uuid default null,
  p_external_message_id text default null,
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_channel not in ('whatsapp', 'email', 'sms', 'other') then
    raise exception 'Canal de comunicação inválido';
  end if;

  if p_status not in ('queued', 'sent', 'delivered', 'failed') then
    raise exception 'Status de comunicação inválido';
  end if;

  insert into public.communication_logs (
    company_id,
    supplier_id,
    supplier_contact_id,
    round_supplier_id,
    order_revision_id,
    channel,
    provider,
    direction,
    status,
    external_message_id,
    error_message,
    sent_at
  )
  values (
    p_company_id,
    p_supplier_id,
    p_supplier_contact_id,
    p_round_supplier_id,
    p_order_revision_id,
    p_channel,
    p_provider,
    'outbound',
    p_status,
    nullif(p_external_message_id, ''),
    nullif(p_error_message, ''),
    case when p_status in ('sent', 'delivered') then now() end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_service_log_communication(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.rpc_service_log_communication(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text
) to service_role;

comment on function public.rpc_service_log_communication(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text
) is 'Grava tentativa de comunicação com o fornecedor. Somente service_role: a autorização é feita na server action.';

-- Fecha o log quando o provedor responde depois do envio (id externo,
-- entrega confirmada, ou falha). Sem isto, uma mensagem enfileirada ficaria
-- 'queued' para sempre e o log mentiria sobre o que aconteceu.
create or replace function public.rpc_service_update_communication_log(
  p_company_id uuid,
  p_communication_log_id uuid,
  p_status text,
  p_external_message_id text default null,
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_status not in ('queued', 'sent', 'delivered', 'failed') then
    raise exception 'Status de comunicação inválido';
  end if;

  update public.communication_logs c
  set status = p_status,
      external_message_id =
        coalesce(nullif(p_external_message_id, ''), c.external_message_id),
      error_message =
        case when p_status = 'failed'
          then coalesce(nullif(p_error_message, ''), c.error_message)
          else c.error_message
        end,
      sent_at = case
        when p_status in ('sent', 'delivered') then coalesce(c.sent_at, now())
        else c.sent_at
      end,
      delivered_at = case
        when p_status = 'delivered' then coalesce(c.delivered_at, now())
        else c.delivered_at
      end
  where c.id = p_communication_log_id
    and c.company_id = p_company_id
  returning c.id into v_id;

  if v_id is null then
    raise exception 'Registro de comunicação inexistente';
  end if;

  return v_id;
end;
$$;

revoke all on function public.rpc_service_update_communication_log(
  uuid, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.rpc_service_update_communication_log(
  uuid, uuid, text, text, text
) to service_role;

commit;
