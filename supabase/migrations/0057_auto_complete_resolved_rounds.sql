-- 0057_auto_complete_resolved_rounds.sql
-- Fecha automaticamente a rodada quando a geração dos pedidos resolve todas
-- as quantidades. Rodadas com qualquer saldo continuam abertas e informam a
-- pendência na interface.

begin;

-- Uma decisão pode dividir a quantidade entre fornecedores. A RPC que gera os
-- pedidos marcava o item como confirmado ao processar o primeiro fornecedor,
-- mesmo quando ainda havia saldo. Preserve o estado aberto até que a soma das
-- alocações confirmadas cubra a quantidade solicitada.
create or replace function private.preserve_partial_quotation_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed_quantity numeric;
begin
  if new.commercial_status = 'confirmed' then
    select coalesce(sum(pa.allocated_quantity), 0)
    into v_confirmed_quantity
    from public.purchase_allocations pa
    where pa.company_id = new.company_id
      and pa.quotation_item_id = new.id
      and pa.status = 'confirmed';

    if v_confirmed_quantity < new.requested_quantity then
      new.commercial_status := 'open';
    end if;
  end if;

  return new;
end;
$$;

create trigger quotation_items_preserve_partial_confirmation
before update of commercial_status on public.quotation_items
for each row execute function private.preserve_partial_quotation_item();

revoke all on function private.preserve_partial_quotation_item()
from public, anon, authenticated;

-- Corrige rodadas ativas que já tenham sido afetadas pela confirmação parcial.
update public.quotation_items qi
set commercial_status = 'open'
from public.purchase_rounds pr
where pr.company_id = qi.company_id
  and pr.id = qi.purchase_round_id
  and pr.status = 'active'
  and qi.commercial_status = 'confirmed'
  and coalesce((
    select sum(pa.allocated_quantity)
    from public.purchase_allocations pa
    where pa.company_id = qi.company_id
      and pa.quotation_item_id = qi.id
      and pa.status = 'confirmed'
  ), 0) < qi.requested_quantity;

create or replace function public.rpc_finalize_round_if_resolved(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_remaining_items integer;
  v_draft_allocations integer;
  v_orders integer;
  v_groups_closed integer := 0;
begin
  perform private.require_permission(p_company_id, 'purchase_allocation.confirm');
  perform private.require_permission(p_company_id, 'order.create');

  select pr.status
  into v_status
  from public.purchase_rounds pr
  where pr.company_id = p_company_id
    and pr.id = p_purchase_round_id
  for update;

  if v_status is null then
    raise exception 'Rodada inexistente';
  end if;

  select count(*)
  into v_remaining_items
  from public.quotation_items qi
  where qi.company_id = p_company_id
    and qi.purchase_round_id = p_purchase_round_id
    and qi.commercial_status not in ('cancelled', 'closed_without_purchase')
    and coalesce((
      select sum(pa.allocated_quantity)
      from public.purchase_allocations pa
      where pa.company_id = qi.company_id
        and pa.quotation_item_id = qi.id
        and pa.status = 'confirmed'
    ), 0) < qi.requested_quantity;

  select count(*)
  into v_draft_allocations
  from public.purchase_allocations pa
  where pa.company_id = p_company_id
    and pa.purchase_round_id = p_purchase_round_id
    and pa.status = 'draft';

  select count(*)
  into v_orders
  from public.orders o
  where o.company_id = p_company_id
    and o.purchase_round_id = p_purchase_round_id
    and o.status <> 'cancelled';

  if v_status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'round_completed', true,
      'remaining_items', 0,
      'draft_allocations', 0,
      'orders_created', v_orders
    );
  end if;

  if v_status = 'active'
     and v_remaining_items = 0
     and v_draft_allocations = 0
     and v_orders > 0 then
    -- Normaliza qualquer item coberto que tenha ficado aberto por uma gravação
    -- antiga. Os encerrados sem compra e cancelados mantêm sua decisão.
    update public.quotation_items qi
    set commercial_status = 'confirmed'
    where qi.company_id = p_company_id
      and qi.purchase_round_id = p_purchase_round_id
      and qi.commercial_status in ('open', 'allocated')
      and coalesce((
        select sum(pa.allocated_quantity)
        from public.purchase_allocations pa
        where pa.company_id = qi.company_id
          and pa.quotation_item_id = qi.id
          and pa.status = 'confirmed'
      ), 0) >= qi.requested_quantity;

    update public.purchase_round_groups g
    set status = 'closed'
    where g.company_id = p_company_id
      and g.purchase_round_id = p_purchase_round_id
      and g.status in ('draft', 'open');

    get diagnostics v_groups_closed = row_count;

    update public.public_access_tokens t
    set revoked_at = now()
    where t.company_id = p_company_id
      and t.purpose = 'quotation_response'
      and t.revoked_at is null
      and t.round_supplier_id in (
        select rs.id
        from public.round_suppliers rs
        where rs.company_id = p_company_id
          and rs.purchase_round_id = p_purchase_round_id
      );

    update public.purchase_rounds pr
    set status = 'completed',
        completed_at = now()
    where pr.company_id = p_company_id
      and pr.id = p_purchase_round_id;

    perform private.emit_domain_event(
      p_company_id,
      'purchase_round.completed',
      'purchase_round',
      p_purchase_round_id,
      jsonb_build_object(
        'automatic', true,
        'groups_closed', v_groups_closed,
        'items_closed_without_purchase', 0,
        'orders_created', v_orders
      ),
      'user',
      auth.uid()
    );

    v_status := 'completed';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'round_completed', v_status = 'completed',
    'remaining_items', v_remaining_items,
    'draft_allocations', v_draft_allocations,
    'orders_created', v_orders
  );
end;
$$;

revoke all on function public.rpc_finalize_round_if_resolved(uuid, uuid)
from public, anon;
grant execute on function public.rpc_finalize_round_if_resolved(uuid, uuid)
to authenticated;

-- A mesma regra corrige rodadas antigas que já geraram todos os pedidos, mas
-- ficaram ativas porque o encerramento antes era um segundo botão escondido.
do $$
declare
  v_round record;
begin
  for v_round in
    select pr.company_id, pr.id
    from public.purchase_rounds pr
    where pr.status = 'active'
      and exists (
        select 1
        from public.orders o
        where o.company_id = pr.company_id
          and o.purchase_round_id = pr.id
          and o.status <> 'cancelled'
      )
      and not exists (
        select 1
        from public.purchase_allocations pa
        where pa.company_id = pr.company_id
          and pa.purchase_round_id = pr.id
          and pa.status = 'draft'
      )
      and not exists (
        select 1
        from public.quotation_items qi
        where qi.company_id = pr.company_id
          and qi.purchase_round_id = pr.id
          and qi.commercial_status not in ('cancelled', 'closed_without_purchase')
          and coalesce((
            select sum(pa.allocated_quantity)
            from public.purchase_allocations pa
            where pa.company_id = qi.company_id
              and pa.quotation_item_id = qi.id
              and pa.status = 'confirmed'
          ), 0) < qi.requested_quantity
      )
  loop
    update public.quotation_items qi
    set commercial_status = 'confirmed'
    where qi.company_id = v_round.company_id
      and qi.purchase_round_id = v_round.id
      and qi.commercial_status in ('open', 'allocated')
      and coalesce((
        select sum(pa.allocated_quantity)
        from public.purchase_allocations pa
        where pa.company_id = qi.company_id
          and pa.quotation_item_id = qi.id
          and pa.status = 'confirmed'
      ), 0) >= qi.requested_quantity;

    update public.purchase_round_groups g
    set status = 'closed'
    where g.company_id = v_round.company_id
      and g.purchase_round_id = v_round.id
      and g.status in ('draft', 'open');

    update public.public_access_tokens t
    set revoked_at = now()
    where t.company_id = v_round.company_id
      and t.purpose = 'quotation_response'
      and t.revoked_at is null
      and t.round_supplier_id in (
        select rs.id
        from public.round_suppliers rs
        where rs.company_id = v_round.company_id
          and rs.purchase_round_id = v_round.id
      );

    update public.purchase_rounds pr
    set status = 'completed',
        completed_at = now()
    where pr.company_id = v_round.company_id
      and pr.id = v_round.id;

    perform private.emit_domain_event(
      v_round.company_id,
      'purchase_round.completed',
      'purchase_round',
      v_round.id,
      jsonb_build_object('automatic', true, 'migration_repair', true),
      'system'
    );
  end loop;
end;
$$;

commit;
