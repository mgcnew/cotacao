-- Lista de pedidos agregada e paginada no banco.
-- Evita transferir todas as revisões e itens de até 200 pedidos para o servidor.

begin;

create or replace function public.rpc_list_orders_page(
  p_company_id uuid,
  p_page integer default 1,
  p_page_size integer default 10,
  p_situation text default null,
  p_supplier_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_order_number bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  v_result jsonb;
begin
  perform private.require_permission(p_company_id, 'order.view');

  if p_situation is not null and p_situation not in (
    'abertos', 'atrasados', 'entrega_hoje', 'draft',
    'awaiting_confirmation', 'awaiting_delivery', 'partially_received',
    'received', 'cancelled'
  ) then
    raise exception 'Situação de pedido inválida';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Período de pedidos inválido';
  end if;

  with filtered_orders as materialized (
    select
      o.id,
      o.order_number,
      o.status,
      s.name as supplier_name,
      pr.title as round_title,
      r.id as revision_id,
      r.delivery_due_date,
      case
        when o.status in (
          'awaiting_confirmation', 'awaiting_delivery', 'partially_received'
        )
          and r.delivery_due_date is not null
          and r.delivery_due_date < company_day.today
        then true else false
      end as is_overdue,
      case
        when o.status in (
          'awaiting_confirmation', 'awaiting_delivery', 'partially_received'
        )
          and r.delivery_due_date is not null
          and r.delivery_due_date < company_day.today
        then company_day.today - r.delivery_due_date else 0
      end as overdue_days,
      company_day.today
    from public.orders o
    join public.suppliers s
      on s.company_id = o.company_id and s.id = o.supplier_id
    left join public.purchase_rounds pr
      on pr.company_id = o.company_id and pr.id = o.purchase_round_id
    join lateral (
      select
        (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date
          as today
      from public.companies c
      where c.id = o.company_id
    ) company_day on true
    left join lateral (
      select candidate.id, candidate.delivery_due_date
      from public.order_revisions candidate
      where candidate.company_id = o.company_id
        and candidate.order_id = o.id
      order by
        (candidate.id = o.current_revision_id) desc,
        candidate.revision_number desc
      limit 1
    ) r on true
    where o.company_id = p_company_id
      and (p_supplier_id is null or o.supplier_id = p_supplier_id)
      and (p_order_number is null or o.order_number = p_order_number)
      and (p_from is null or o.created_at >= p_from::timestamptz)
      and (p_to is null or o.created_at < (p_to + 1)::timestamptz)
      and (
        p_situation is null
        or (p_situation = 'abertos' and o.status in (
          'draft', 'awaiting_confirmation', 'awaiting_delivery',
          'partially_received'
        ))
        or (p_situation = 'atrasados' and o.status in (
          'awaiting_confirmation', 'awaiting_delivery', 'partially_received'
        ) and r.delivery_due_date < company_day.today)
        or (p_situation = 'entrega_hoje' and o.status in (
          'awaiting_confirmation', 'awaiting_delivery', 'partially_received'
        ) and r.delivery_due_date = company_day.today)
        or o.status = p_situation
      )
  ),
  item_totals as materialized (
    select
      filtered.id as order_id,
      count(item.id)::integer as item_count,
      coalesce(sum(item.requested_quantity * item.agreed_price), 0) as total
    from filtered_orders filtered
    left join public.order_revision_items item
      on item.company_id = p_company_id
      and item.order_revision_id = filtered.revision_id
    group by filtered.id
  ),
  enriched as materialized (
    select
      filtered.id,
      filtered.order_number,
      filtered.status,
      filtered.supplier_name,
      filtered.round_title,
      filtered.delivery_due_date,
      totals.item_count,
      totals.total,
      filtered.is_overdue,
      filtered.overdue_days
    from filtered_orders filtered
    join item_totals totals on totals.order_id = filtered.id
  ),
  stats as (
    select
      count(*)::integer as quantity,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as value,
      count(*) filter (where status = 'draft')::integer as drafts,
      count(*) filter (where status = 'awaiting_confirmation')::integer
        as awaiting_confirmation,
      count(*) filter (
        where status in ('awaiting_delivery', 'partially_received')
      )::integer as to_receive,
      count(*) filter (where is_overdue)::integer as overdue
    from enriched
  ),
  bounds as (
    select
      stats.*,
      least(
        v_page,
        greatest(ceil(stats.quantity::numeric / v_page_size)::integer, 1)
      ) as effective_page
    from stats
  ),
  page_rows as (
    select *
    from enriched
    order by order_number desc
    limit v_page_size
    offset ((select effective_page from bounds) - 1) * v_page_size
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'orderNumber', row.order_number,
          'status', row.status,
          'supplierName', row.supplier_name,
          'roundTitle', row.round_title,
          'deliveryDueDate', row.delivery_due_date,
          'itemCount', row.item_count,
          'total', row.total,
          'isOverdue', row.is_overdue,
          'overdueDays', row.overdue_days
        ) order by row.order_number desc
      )
      from page_rows row
    ), '[]'::jsonb),
    'total', bounds.quantity,
    'page', bounds.effective_page,
    'pageSize', v_page_size,
    'summary', jsonb_build_object(
      'quantity', bounds.quantity,
      'value', bounds.value,
      'drafts', bounds.drafts,
      'awaitingConfirmation', bounds.awaiting_confirmation,
      'toReceive', bounds.to_receive,
      'overdue', bounds.overdue
    )
  ) into v_result
  from bounds;

  return v_result;
end;
$$;

revoke all on function public.rpc_list_orders_page(
  uuid, integer, integer, text, uuid, date, date, bigint
) from public, anon;
grant execute on function public.rpc_list_orders_page(
  uuid, integer, integer, text, uuid, date, date, bigint
) to authenticated;

commit;
