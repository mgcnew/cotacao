-- 0056_manual_order_confirmation.sql
-- Registra confirmações recebidas fora do link sem confundi-las com o aceite público.

begin;

alter table public.order_revisions
  add column confirmation_source text
    check (confirmation_source is null or confirmation_source in ('supplier_link', 'manual')),
  add column confirmation_channel text
    check (confirmation_channel is null or confirmation_channel in ('phone', 'whatsapp', 'email', 'in_person', 'other')),
  add column confirmation_notes text
    check (confirmation_notes is null or char_length(confirmation_notes) <= 500),
  add column confirmed_by uuid references auth.users(id) on delete set null;

-- Confirmações anteriores nasceram exclusivamente pelo link público.
update public.order_revisions
set confirmation_source = 'supplier_link'
where confirmed_at is not null;

alter table public.order_revisions
  add constraint order_revisions_confirmation_metadata_check check (
    confirmation_source is null
    or confirmed_at is not null
  ),
  add constraint order_revisions_manual_confirmation_channel_check check (
    confirmation_source <> 'manual' or confirmation_channel is not null
  );

-- A RPC pública antiga não informa a origem. O trigger completa o dado antes
-- do UPDATE e mantém o endpoint público compatível sem duplicar sua lógica.
create or replace function private.set_order_confirmation_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.confirmation_source is null then
    new.confirmation_source := 'supplier_link';
  end if;
  return new;
end;
$$;

create trigger order_revisions_set_confirmation_source
before update of status on public.order_revisions
for each row execute function private.set_order_confirmation_source();

revoke all on function private.set_order_confirmation_source()
from public, anon, authenticated;

create or replace function public.rpc_confirm_order_manually(
  p_company_id uuid,
  p_order_id uuid,
  p_order_revision_id uuid,
  p_channel text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status text;
  v_current_revision_id uuid;
  v_revision_status text;
  v_notes text;
begin
  perform private.require_permission(p_company_id, 'order.send');

  if p_channel is null
     or p_channel not in ('phone', 'whatsapp', 'email', 'in_person', 'other') then
    raise exception 'Canal de confirmação inválido';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_notes), '');
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'A observação deve ter no máximo 500 caracteres';
  end if;

  select o.status, o.current_revision_id, r.status
  into v_order_status, v_current_revision_id, v_revision_status
  from public.orders o
  join public.order_revisions r
    on r.company_id = o.company_id
   and r.order_id = o.id
   and r.id = p_order_revision_id
  where o.company_id = p_company_id
    and o.id = p_order_id
  for update of o, r;

  if not found then
    raise exception 'Pedido ou revisão não encontrado';
  end if;

  if v_current_revision_id <> p_order_revision_id then
    raise exception 'Esta não é a revisão vigente do pedido';
  end if;

  if v_revision_status = 'confirmed' and v_order_status = 'awaiting_delivery' then
    return jsonb_build_object(
      'order_id', p_order_id,
      'order_revision_id', p_order_revision_id,
      'status', 'confirmed'
    );
  end if;

  if v_order_status <> 'awaiting_confirmation' or v_revision_status <> 'sent' then
    raise exception 'Somente um pedido enviado e aguardando confirmação pode ser confirmado manualmente';
  end if;

  update public.order_revisions
  set status = 'superseded'
  where company_id = p_company_id
    and order_id = p_order_id
    and id <> p_order_revision_id
    and status = 'confirmed';

  update public.order_revisions
  set status = 'confirmed',
      confirmed_at = now(),
      confirmation_source = 'manual',
      confirmation_channel = p_channel,
      confirmation_notes = v_notes,
      confirmed_by = auth.uid()
  where company_id = p_company_id
    and id = p_order_revision_id;

  update public.orders
  set status = 'awaiting_delivery',
      current_revision_id = p_order_revision_id
  where company_id = p_company_id
    and id = p_order_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.confirmed_manually',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_revision_id', p_order_revision_id,
      'channel', p_channel,
      'notes', v_notes
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_revision_id', p_order_revision_id,
    'status', 'confirmed',
    'source', 'manual'
  );
end;
$$;

revoke all on function public.rpc_confirm_order_manually(uuid, uuid, uuid, text, text)
from public, anon;
grant execute on function public.rpc_confirm_order_manually(uuid, uuid, uuid, text, text)
to authenticated;

commit;
