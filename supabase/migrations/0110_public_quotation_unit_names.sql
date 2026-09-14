-- O link público mostrava a unidade só pela sigla: o fornecedor lia "quantas un
-- vêm em cada fd". Para embalagem vendida por metro ou por quilo a frase não se
-- sustentava. Devolver `name` e `kind` das unidades deixa o link escrever
-- "Cada fardo tem 500 unidades" ou "Cada rolo tem 300 metros", e `purpose`
-- diz quando o item é embalagem sem o link ter que deduzir.
--
-- Nada sai do payload: só entram campos. Um link aberto antes desta migration
-- continua válido.

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

revoke all on function public.rpc_public_get_quotation(text) from public;
grant execute on function public.rpc_public_get_quotation(text) to anon, authenticated;

commit;
