-- O fator de conversão deixa de ser escrito à mão na categoria e passa a sair
-- das unidades do próprio produto: "Metros por rolo" nasce de precificação em
-- rolo e comparação em metro. Uma categoria comporta um único fator com uma
-- única unidade, e era isso que impedia resinite por metro de conviver com
-- sacola por unidade em Embalagens.
--
-- A leitura já preferia a definição do produto — a comparação da rodada, o
-- gatilho de estimativa da alocação (0058) e a confirmação do pedido (0088)
-- todos ordenam produto antes de categoria. Faltavam as duas RPCs públicas,
-- que devolviam as duas definições e deixavam o link escolher pela ordenação.
--
-- Produto sem fator próprio continua usando o da categoria, como sempre.

begin;

create or replace function public.rpc_public_get_quotation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  update public.round_suppliers
  set first_accessed_at = coalesce(first_accessed_at, now())
  where id = v_token.round_supplier_id
    and company_id = v_token.company_id;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'name', c.name,
      'legal_name', c.legal_name,
      'document_number', c.document_number,
      'logo_path', c.logo_path
    ),
    'supplier', jsonb_build_object(
      'id', s.id,
      'name', s.name
    ),
    'purchase_round', jsonb_build_object(
      'id', pr.id,
      'title', pr.title
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'supplier_quotation_item_id', sqi.id,
          'quotation_item_id', qi.id,
          'group', g.name,
          'product_id', p.id,
          'product_name', p.name,
          'photo_path', p.photo_path,
          'requested_quantity', qi.requested_quantity,
          'purpose', p.purpose,
          'purchase_unit', jsonb_build_object(
            'id', pu.id, 'code', pu.code, 'symbol', pu.symbol,
            'name', pu.name, 'kind', pu.kind
          ),
          'pricing_unit', jsonb_build_object(
            'id', pru.id, 'code', pru.code, 'symbol', pru.symbol,
            'name', pru.name, 'kind', pru.kind
          ),
          'comparison_unit', case
            when cu.id is null then null
            else jsonb_build_object(
              'id', cu.id, 'code', cu.code, 'symbol', cu.symbol,
              'name', cu.name, 'kind', cu.kind
            )
          end,
          'notes', qi.notes,
          'already_answered', exists (
            select 1
            from public.quotation_responses qr
            join public.quotation_response_items qri
              on qri.quotation_response_id = qr.id
             and qri.company_id = qr.company_id
            where qr.round_supplier_id = v_token.round_supplier_id
              and qr.company_id = v_token.company_id
              and qri.supplier_quotation_item_id = sqi.id
          ),
          'attributes', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'attribute_definition_id', pad.id,
                'name', pad.name,
                'key', pad.key,
                'data_type', pad.data_type,
                'required', pad.is_required,
                'unit', case
                  when au.id is null then null
                  else jsonb_build_object(
                    'id', au.id, 'symbol', au.symbol,
                    'name', au.name, 'kind', au.kind
                  )
                end
              )
              order by pad.sort_order, pad.name
            )
            from public.product_attribute_definitions pad
            left join public.units au
              on au.id = pad.unit_id
             and au.company_id = pad.company_id
            where pad.company_id = p.company_id
              and pad.is_active = true
              and (
                pad.product_id = p.id
                or pad.category_id = p.category_id
              )
              and not (
                -- Fator do produto vence o da categoria. Sem isto o fornecedor
                -- receberia os dois e o link escolheria pela ordenação.
                pad.is_conversion_factor = true
                and pad.category_id is not null
                and exists (
                  select 1
                  from public.product_attribute_definitions own
                  where own.company_id = p.company_id
                    and own.product_id = p.id
                    and own.is_active = true
                    and own.is_conversion_factor = true
                )
              )
          ), '[]'::jsonb)
        )
        order by g.sort_order, p.name
      )
      from public.supplier_quotation_items sqi
      join public.quotation_items qi
        on qi.id = sqi.quotation_item_id
       and qi.company_id = sqi.company_id
      join public.purchase_round_groups g
        on g.id = qi.group_id
       and g.company_id = qi.company_id
      join public.products p
        on p.id = qi.product_id
       and p.company_id = qi.company_id
      join public.units pu
        on pu.id = qi.purchase_unit_id
       and pu.company_id = qi.company_id
      join public.units pru
        on pru.id = qi.pricing_unit_id
       and pru.company_id = qi.company_id
      left join public.units cu
        on cu.id = qi.comparison_unit_id
       and cu.company_id = qi.company_id
      where sqi.round_supplier_id = v_token.round_supplier_id
        and sqi.company_id = v_token.company_id
        and sqi.removed_at is null
    ), '[]'::jsonb)
  )
  into v_result
  from public.round_suppliers rs
  join public.purchase_rounds pr
    on pr.id = rs.purchase_round_id
   and pr.company_id = rs.company_id
  join public.companies c
    on c.id = rs.company_id
  join public.suppliers s
    on s.id = rs.supplier_id
   and s.company_id = rs.company_id
  where rs.id = v_token.round_supplier_id
    and rs.company_id = v_token.company_id;

  if v_result is null then
    raise exception 'Cotação não encontrada';
  end if;

  return v_result;
end;
$$;

create or replace function public.rpc_public_get_quotation_conversion_context(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  select coalesce(jsonb_agg(jsonb_build_object(
    'supplier_quotation_item_id', current_sqi.id,
    'attribute_definition_id', pad.id,
    'suggested_value_numeric', previous_value.value_numeric,
    'suggested_confirmed_at', previous_value.confirmed_at
  )), '[]'::jsonb)
  into v_result
  from public.supplier_quotation_items current_sqi
  join public.quotation_items qi
    on qi.id = current_sqi.quotation_item_id
   and qi.company_id = current_sqi.company_id
  join public.products p
    on p.id = qi.product_id
   and p.company_id = qi.company_id
  join public.product_attribute_definitions pad
    on pad.company_id = p.company_id
   and pad.is_active = true
   and pad.is_conversion_factor = true
   and (pad.product_id = p.id or pad.category_id = p.category_id)
   and not (
     -- Mesmo desempate da `rpc_public_get_quotation`: o fator do produto
     -- esconde o da categoria, senão o link recebe dois e escolhe no escuro.
     pad.category_id is not null
     and exists (
       select 1
       from public.product_attribute_definitions own
       where own.company_id = p.company_id
         and own.product_id = p.id
         and own.is_active = true
         and own.is_conversion_factor = true
     )
   )
  left join lateral (
    select rav.value_numeric, rav.confirmed_at
    from public.quotation_response_attribute_values rav
    join public.quotation_response_items previous_item
      on previous_item.id = rav.quotation_response_item_id
     and previous_item.company_id = rav.company_id
    join public.supplier_quotation_items previous_sqi
      on previous_sqi.id = previous_item.supplier_quotation_item_id
     and previous_sqi.company_id = previous_item.company_id
    join public.quotation_items previous_qi
      on previous_qi.id = previous_sqi.quotation_item_id
     and previous_qi.company_id = previous_sqi.company_id
    join public.quotation_responses previous_response
      on previous_response.id = previous_item.quotation_response_id
     and previous_response.company_id = previous_item.company_id
    join public.round_suppliers previous_supplier
      on previous_supplier.id = previous_response.round_supplier_id
     and previous_supplier.company_id = previous_response.company_id
    where rav.company_id = v_token.company_id
      and rav.attribute_definition_id = pad.id
      and rav.value_numeric > 0
      and previous_supplier.supplier_id = v_token.supplier_id
      and previous_qi.product_id = p.id
    order by rav.confirmed_at desc, rav.created_at desc
    limit 1
  ) previous_value on true
  where current_sqi.company_id = v_token.company_id
    and current_sqi.round_supplier_id = v_token.round_supplier_id
    and current_sqi.removed_at is null;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_quotation(text) from public;
grant execute on function public.rpc_public_get_quotation(text) to anon, authenticated;

revoke all on function public.rpc_public_get_quotation_conversion_context(text)
from public;
grant execute on function public.rpc_public_get_quotation_conversion_context(text)
to anon, authenticated;

commit;
