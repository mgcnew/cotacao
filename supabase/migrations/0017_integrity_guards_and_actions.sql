-- 0017_integrity_guards_and_actions.sql
-- Proteções contra mutação indevida + ações operacionais que faltavam.

begin;

-- ============================================================
-- REVISÕES DE PEDIDO: ITENS SÓ PODEM MUDAR ENQUANTO DRAFT
-- ============================================================

create or replace function private.guard_order_revision_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_revision_id uuid;
  v_status text;
begin
  v_revision_id := case
    when tg_op = 'DELETE' then old.order_revision_id
    else new.order_revision_id
  end;

  select r.status
  into v_status
  from public.order_revisions r
  where r.id = v_revision_id;

  if v_status is null then
    raise exception 'Revisão inexistente';
  end if;

  if v_status <> 'draft' then
    raise exception 'Itens de revisão enviada/confirmada são imutáveis';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger order_revision_items_guard_update
before update on public.order_revision_items
for each row execute function private.guard_order_revision_item_mutation();

create trigger order_revision_items_guard_delete
before delete on public.order_revision_items
for each row execute function private.guard_order_revision_item_mutation();

-- Campos comerciais da própria revisão ficam imutáveis após sair do draft.
create or replace function private.guard_order_revision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
       new.order_id is distinct from old.order_id
    or new.revision_number is distinct from old.revision_number
    or new.delivery_due_date is distinct from old.delivery_due_date
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Conteúdo de revisão não pode mudar após envio';
  end if;

  return new;
end;
$$;

create trigger order_revisions_guard_update
before update on public.order_revisions
for each row execute function private.guard_order_revision_update();

-- ============================================================
-- RESPOSTAS: REMOVER UPDATE DIRETO.
-- Correção passa obrigatoriamente pela RPC auditável abaixo.
-- ============================================================

revoke update on public.quotation_response_items from authenticated;
revoke update on public.quotation_response_attribute_values from authenticated;

drop policy if exists quotation_response_items_update_manual
on public.quotation_response_items;

drop policy if exists quotation_response_attribute_values_update_correct
on public.quotation_response_attribute_values;

create or replace function public.rpc_correct_quotation_response_item(
  p_company_id uuid,
  p_quotation_response_item_id uuid,
  p_quoted_price numeric default null,
  p_is_available boolean default null,
  p_does_not_supply boolean default null,
  p_notes text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.quotation_response_items;
  v_new_price numeric(18,6);
  v_new_available boolean;
  v_new_does_not_supply boolean;
  v_new_notes text;
begin
  perform private.require_permission(p_company_id, 'quotation_response.correct');

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo da correção é obrigatório';
  end if;

  select *
  into v_old
  from public.quotation_response_items qri
  where qri.id = p_quotation_response_item_id
    and qri.company_id = p_company_id
  for update;

  if v_old.id is null then
    raise exception 'Resposta não encontrada';
  end if;

  v_new_price := coalesce(p_quoted_price, v_old.quoted_price);
  v_new_available := coalesce(p_is_available, v_old.is_available);
  v_new_does_not_supply := coalesce(p_does_not_supply, v_old.does_not_supply);
  v_new_notes := coalesce(p_notes, v_old.notes);

  if v_new_price is not null and v_new_price < 0 then
    raise exception 'Preço inválido';
  end if;

  if v_new_does_not_supply = true and v_new_available = true then
    raise exception 'Item não pode estar disponível e marcado como não fornecido';
  end if;

  if v_new_price is distinct from v_old.quoted_price then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'quoted_price',
      to_jsonb(v_old.quoted_price), to_jsonb(v_new_price),
      p_reason, auth.uid()
    );
  end if;

  if v_new_available is distinct from v_old.is_available then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'is_available',
      to_jsonb(v_old.is_available), to_jsonb(v_new_available),
      p_reason, auth.uid()
    );
  end if;

  if v_new_does_not_supply is distinct from v_old.does_not_supply then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'does_not_supply',
      to_jsonb(v_old.does_not_supply), to_jsonb(v_new_does_not_supply),
      p_reason, auth.uid()
    );
  end if;

  if v_new_notes is distinct from v_old.notes then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'notes',
      to_jsonb(v_old.notes), to_jsonb(v_new_notes),
      p_reason, auth.uid()
    );
  end if;

  update public.quotation_response_items
  set quoted_price = v_new_price,
      is_available = v_new_available,
      does_not_supply = v_new_does_not_supply,
      notes = v_new_notes
  where id = v_old.id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'quotation.response_corrected',
    'quotation_response_item',
    v_old.id,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object(
    'quotation_response_item_id', v_old.id,
    'quoted_price', v_new_price,
    'is_available', v_new_available,
    'does_not_supply', v_new_does_not_supply
  );
end;
$$;

revoke all on function public.rpc_correct_quotation_response_item(
  uuid,uuid,numeric,boolean,boolean,text,text
) from public;

grant execute on function public.rpc_correct_quotation_response_item(
  uuid,uuid,numeric,boolean,boolean,text,text
) to authenticated;

-- ============================================================
-- COTAÇÃO: MARCAR FORNECEDOR COMO ENVIADO
-- Chamar somente após sucesso real da comunicação.
-- ============================================================

create or replace function public.rpc_mark_round_supplier_sent(
  p_company_id uuid,
  p_round_supplier_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_supplier_id uuid;
begin
  perform private.require_permission(p_company_id, 'purchase_round.send');

  select rs.purchase_round_id, rs.supplier_id
  into v_round_id, v_supplier_id
  from public.round_suppliers rs
  where rs.id = p_round_supplier_id
    and rs.company_id = p_company_id
  for update;

  if v_round_id is null then
    raise exception 'Fornecedor da rodada não encontrado';
  end if;

  if not exists (
    select 1
    from public.purchase_rounds pr
    where pr.id = v_round_id
      and pr.company_id = p_company_id
      and pr.status in ('draft','active')
  ) then
    raise exception 'Rodada não permite envio';
  end if;

  update public.round_suppliers
  set first_sent_at = coalesce(first_sent_at, now())
  where id = p_round_supplier_id
    and company_id = p_company_id;

  update public.purchase_rounds
  set status = 'active',
      started_at = coalesce(started_at, now())
  where id = v_round_id
    and company_id = p_company_id;

  update public.purchase_round_groups
  set status = case when status = 'draft' then 'open' else status end
  where purchase_round_id = v_round_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'quotation.sent',
    'round_supplier',
    p_round_supplier_id,
    jsonb_build_object(
      'purchase_round_id', v_round_id,
      'supplier_id', v_supplier_id
    )
  );

  return jsonb_build_object(
    'round_supplier_id', p_round_supplier_id,
    'purchase_round_id', v_round_id,
    'sent', true
  );
end;
$$;

revoke all on function public.rpc_mark_round_supplier_sent(uuid,uuid) from public;
grant execute on function public.rpc_mark_round_supplier_sent(uuid,uuid)
to authenticated;

-- ============================================================
-- TOKEN PÚBLICO: REGISTRO CONTROLADO PELO BACKEND
--
-- p_token_hash deve ser SHA-256 hexadecimal do token bruto.
-- Apenas service_role possui EXECUTE.
-- ============================================================

create or replace function public.rpc_service_store_public_token(
  p_company_id uuid,
  p_purpose text,
  p_supplier_id uuid,
  p_round_supplier_id uuid default null,
  p_order_revision_id uuid default null,
  p_token_hash text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'token_hash deve ser SHA-256 hexadecimal';
  end if;

  insert into public.public_access_tokens (
    company_id,
    purpose,
    supplier_id,
    round_supplier_id,
    order_revision_id,
    token_hash,
    expires_at
  )
  values (
    p_company_id,
    p_purpose,
    p_supplier_id,
    p_round_supplier_id,
    p_order_revision_id,
    lower(p_token_hash),
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_service_store_public_token(
  uuid,text,uuid,uuid,uuid,text,timestamptz
) from public, anon, authenticated;

grant execute on function public.rpc_service_store_public_token(
  uuid,text,uuid,uuid,uuid,text,timestamptz
) to service_role;

-- ============================================================
-- PEDIDO: aprimora envio de nova revisão.
-- Se a revisão anterior vigente estava contestada, ela é superseded
-- quando a nova revisão é efetivamente enviada.
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
  v_previous_revision_id uuid;
  v_previous_status text;
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

  select o.current_revision_id
  into v_previous_revision_id
  from public.orders o
  where o.id = v_order_id
    and o.company_id = p_company_id
  for update;

  if v_previous_revision_id is not null
     and v_previous_revision_id <> p_order_revision_id then
    select r.status
    into v_previous_status
    from public.order_revisions r
    where r.id = v_previous_revision_id
      and r.company_id = p_company_id;

    if v_previous_status = 'contested' then
      update public.order_revisions
      set status = 'superseded'
      where id = v_previous_revision_id
        and company_id = p_company_id;
    end if;
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

-- ============================================================
-- RESOLVER DIVERGÊNCIA PRÉ-ENTREGA
-- O conteúdo do pedido continua sendo alterado somente por nova revisão.
-- ============================================================

create or replace function public.rpc_resolve_order_divergence(
  p_company_id uuid,
  p_order_divergence_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  perform private.require_permission(p_company_id, 'order.revise');

  if p_status not in ('accepted','rejected','resolved','cancelled') then
    raise exception 'Status de resolução inválido';
  end if;

  select od.order_id
  into v_order_id
  from public.order_divergences od
  where od.id = p_order_divergence_id
    and od.company_id = p_company_id
    and od.status = 'pending'
  for update;

  if v_order_id is null then
    raise exception 'Divergência pendente não encontrada';
  end if;

  update public.order_divergences
  set status = p_status,
      notes = case
        when p_notes is null then notes
        when notes is null then p_notes
        else notes || E'\n' || p_notes
      end,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_order_divergence_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.divergence_resolved',
    'order',
    v_order_id,
    jsonb_build_object(
      'order_divergence_id', p_order_divergence_id,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'order_divergence_id', p_order_divergence_id,
    'order_id', v_order_id,
    'status', p_status
  );
end;
$$;

revoke all on function public.rpc_resolve_order_divergence(uuid,uuid,text,text) from public;
grant execute on function public.rpc_resolve_order_divergence(uuid,uuid,text,text)
to authenticated;

-- ============================================================
-- RESOLVER DIVERGÊNCIA COMERCIAL NO RECEBIMENTO
-- ============================================================

create or replace function public.rpc_resolve_commercial_divergence(
  p_company_id uuid,
  p_divergence_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  perform private.require_permission(p_company_id, 'commercial_divergence.manage');

  if p_status not in ('accepted','to_dispute','resolved','justified') then
    raise exception 'Status de divergência comercial inválido';
  end if;

  select cd.order_id
  into v_order_id
  from public.commercial_divergences cd
  where cd.id = p_divergence_id
    and cd.company_id = p_company_id
  for update;

  if v_order_id is null then
    raise exception 'Divergência comercial não encontrada';
  end if;

  update public.commercial_divergences
  set status = p_status,
      resolution_notes = p_resolution_notes,
      resolved_by = case
        when p_status in ('resolved','accepted','justified') then auth.uid()
        else resolved_by
      end,
      resolved_at = case
        when p_status in ('resolved','accepted','justified') then now()
        else null
      end
  where id = p_divergence_id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'commercial_divergence.status_changed',
    'commercial_divergence',
    p_divergence_id,
    jsonb_build_object(
      'order_id', v_order_id,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'commercial_divergence_id', p_divergence_id,
    'status', p_status
  );
end;
$$;

revoke all on function public.rpc_resolve_commercial_divergence(uuid,uuid,text,text)
from public;

grant execute on function public.rpc_resolve_commercial_divergence(uuid,uuid,text,text)
to authenticated;

commit;
