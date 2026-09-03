-- Acrescenta ao relatório congelado da cotação uma posição dinâmica dos
-- recebimentos. Os dois resultados permanecem separados: o snapshot registra
-- o que era conhecido na conclusão; esta RPC calcula somente quantidades de
-- recebimentos efetivamente lançados (`posted`).

begin;

create or replace function public.rpc_get_purchase_round_realization(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_permission(
    p_company_id,
    'purchase_allocation.view'
  );

  if not exists (
    select 1
    from public.purchase_rounds round
    where round.company_id = p_company_id
      and round.id = p_purchase_round_id
  ) then
    return null;
  end if;

  with ordered_items as materialized (
    select
      item.id,
      orders.id as order_id,
      orders.order_number,
      orders.supplier_id,
      supplier.name as supplier_name,
      item.product_id,
      item.product_name_snapshot as product_name,
      item.requested_quantity,
      purchase_unit.symbol as purchase_unit,
      pricing_unit.symbol as pricing_unit,
      response_item.quoted_price,
      item.agreed_price
    from public.orders orders
    join public.order_revisions revision
      on revision.company_id = orders.company_id
     and revision.id = orders.current_revision_id
    join public.order_revision_items item
      on item.company_id = revision.company_id
     and item.order_revision_id = revision.id
    join public.suppliers supplier
      on supplier.company_id = orders.company_id
     and supplier.id = orders.supplier_id
    join public.units purchase_unit
      on purchase_unit.company_id = item.company_id
     and purchase_unit.id = item.purchase_unit_id
    join public.units pricing_unit
      on pricing_unit.company_id = item.company_id
     and pricing_unit.id = item.pricing_unit_id
    left join public.purchase_allocations allocation
      on allocation.company_id = item.company_id
     and allocation.id = item.purchase_allocation_id
    left join public.quotation_response_items response_item
      on response_item.company_id = allocation.company_id
     and response_item.id = allocation.quotation_response_item_id
    where orders.company_id = p_company_id
      and orders.purchase_round_id = p_purchase_round_id
      and orders.status <> 'cancelled'
  ),
  received as materialized (
    select
      item.id as order_revision_item_id,
      count(distinct receipt.id)::integer as receipt_count,
      sum(receipt_item.logistic_quantity_received) as logistic_quantity,
      sum(receipt_item.pricing_quantity_received) as pricing_quantity,
      case
        when sum(receipt_item.pricing_quantity_received) > 0
        then sum(
          receipt_item.practiced_price
          * receipt_item.pricing_quantity_received
        ) / sum(receipt_item.pricing_quantity_received)
        else null
      end as practiced_price,
      sum(
        (item.quoted_price - item.agreed_price)
        * receipt_item.pricing_quantity_received
      ) filter (where item.quoted_price is not null)
        as negotiated_savings,
      sum(
        (item.quoted_price - receipt_item.practiced_price)
        * receipt_item.pricing_quantity_received
      ) filter (where item.quoted_price is not null)
        as realized_savings,
      sum(
        (receipt_item.practiced_price - item.agreed_price)
        * receipt_item.pricing_quantity_received
      ) as divergence_impact,
      sum(
        receipt_item.practiced_price
        * receipt_item.pricing_quantity_received
      ) as actual_cost,
      max(receipt.received_at) as last_received_at
    from ordered_items item
    join public.receipt_items receipt_item
      on receipt_item.company_id = p_company_id
     and receipt_item.order_revision_item_id = item.id
    join public.receipts receipt
      on receipt.company_id = receipt_item.company_id
     and receipt.id = receipt_item.receipt_id
     and receipt.status = 'posted'
    group by item.id
  ),
  item_results as materialized (
    select
      item.*,
      coalesce(received.receipt_count, 0) as receipt_count,
      coalesce(received.logistic_quantity, 0) as received_quantity,
      coalesce(received.pricing_quantity, 0) as received_pricing_quantity,
      received.practiced_price,
      received.negotiated_savings,
      received.realized_savings,
      received.divergence_impact,
      received.actual_cost,
      received.last_received_at,
      case
        when coalesce(received.logistic_quantity, 0) <= 0 then 'pending'
        when received.logistic_quantity < item.requested_quantity then 'partial'
        else 'received'
      end as receipt_status
    from ordered_items item
    left join received on received.order_revision_item_id = item.id
  )
  select jsonb_build_object(
    'calculatedAt', now(),
    'lastReceiptAt', (select max(last_received_at) from item_results),
    'summary', jsonb_build_object(
      'orderedItemCount', (select count(*)::integer from item_results),
      'receivedItemCount', (
        select count(*)::integer from item_results
        where receipt_status <> 'pending'
      ),
      'calculableReceivedItemCount', (
        select count(*)::integer from item_results
        where receipt_status <> 'pending'
          and quoted_price is not null
      ),
      'fullyReceivedItemCount', (
        select count(*)::integer from item_results
        where receipt_status = 'received'
      ),
      'partiallyReceivedItemCount', (
        select count(*)::integer from item_results
        where receipt_status = 'partial'
      ),
      'pendingItemCount', (
        select count(*)::integer from item_results
        where receipt_status = 'pending'
      ),
      'postedReceiptCount', (
        select count(distinct receipt.id)::integer
        from public.receipts receipt
        join public.orders orders
          on orders.company_id = receipt.company_id
         and orders.id = receipt.order_id
        where receipt.company_id = p_company_id
          and receipt.status = 'posted'
          and orders.purchase_round_id = p_purchase_round_id
          and orders.status <> 'cancelled'
      ),
      'negotiatedSavingsOnReceived', coalesce((
        select sum(negotiated_savings) from item_results
      ), 0),
      'realizedSavings', coalesce((
        select sum(realized_savings) from item_results
      ), 0),
      'divergenceImpact', coalesce((
        select sum(divergence_impact) from item_results
      ), 0),
      'actualCost', coalesce((
        select sum(actual_cost) from item_results
      ), 0)
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderRevisionItemId', item.id,
        'orderId', item.order_id,
        'orderNumber', item.order_number,
        'supplierId', item.supplier_id,
        'supplierName', item.supplier_name,
        'productId', item.product_id,
        'productName', item.product_name,
        'requestedQuantity', item.requested_quantity,
        'purchaseUnit', item.purchase_unit,
        'pricingUnit', item.pricing_unit,
        'receivedQuantity', item.received_quantity,
        'receivedPricingQuantity', item.received_pricing_quantity,
        'quotedPrice', item.quoted_price,
        'agreedPrice', item.agreed_price,
        'practicedPrice', item.practiced_price,
        'negotiatedSavingsOnReceived', item.negotiated_savings,
        'realizedSavings', item.realized_savings,
        'divergenceImpact', item.divergence_impact,
        'receiptStatus', item.receipt_status,
        'receiptCount', item.receipt_count,
        'lastReceivedAt', item.last_received_at
      ) order by item.supplier_name, item.product_name, item.id)
      from item_results item
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_purchase_round_realization(uuid, uuid)
from public, anon;
grant execute on function public.rpc_get_purchase_round_realization(uuid, uuid)
to authenticated;

commit;
