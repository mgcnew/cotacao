-- Referência segura para conferir preços digitados no link público.
-- Retorna somente o último valor efetivamente pago AO PRÓPRIO fornecedor,
-- na mesma unidade de preço do item atual. Nenhum preço ou nome de concorrente
-- atravessa o token.

begin;

create or replace function public.rpc_public_get_quotation_price_context(
  p_token text
)
returns table (
  supplier_quotation_item_id uuid,
  last_supplier_price numeric,
  last_supplier_price_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  return query
  select
    supplier_item.id,
    history.practiced_price,
    history.occurred_at
  from public.supplier_quotation_items supplier_item
  join public.quotation_items quotation_item
    on quotation_item.company_id = supplier_item.company_id
   and quotation_item.id = supplier_item.quotation_item_id
  join public.units pricing_unit
    on pricing_unit.company_id = quotation_item.company_id
   and pricing_unit.id = quotation_item.pricing_unit_id
  left join lateral (
    select purchase.practiced_price, purchase.occurred_at
    from public.v_purchase_price_history purchase
    where purchase.company_id = v_token.company_id
      and purchase.supplier_id = v_token.supplier_id
      and purchase.product_id = quotation_item.product_id
      and purchase.pricing_unit_symbol = pricing_unit.symbol
      and purchase.practiced_price is not null
      and purchase.occurred_at is not null
    order by purchase.occurred_at desc, purchase.event_id desc
    limit 1
  ) history on true
  where supplier_item.company_id = v_token.company_id
    and supplier_item.round_supplier_id = v_token.round_supplier_id
    and supplier_item.removed_at is null;
end;
$$;

revoke all on function public.rpc_public_get_quotation_price_context(text)
from public;
grant execute on function public.rpc_public_get_quotation_price_context(text)
to anon, authenticated;

commit;
