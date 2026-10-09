-- Fator do produto contra fator da categoria, nas três funções que ficaram
-- para trás na 0111.
--
-- Desde a 0111 um produto pode ter fator próprio ("Metros por bobina") além do
-- da categoria ("Quantidade por pacote"). O link do fornecedor já escondia o
-- da categoria quando o produto tinha o seu; estas três funções, não:
--
-- 1. Lançar preço pelo fornecedor (rpc_record_manual_quotation_item_with_
--    conversion) e corrigir uma resposta (rpc_correct_quotation_item_with_
--    conversion) escolhiam o fator com `limit 1` sem ordem. Com os dois
--    disponíveis, o banco podia pegar o da categoria enquanto a tela mandava o
--    do produto — "Fator de conversão inválido para este produto" ao lançar
--    R$ 169 / 800 m no Resinit, em 08/10/2026.
--
-- 2. O envio pelo link (rpc_public_submit_quotation_validated) exigia todo
--    fator obrigatório do produto ou da categoria. O da categoria é
--    obrigatório e não aparece no link quando o produto tem o seu: o
--    fornecedor recebia "Preencha o campo obrigatório: Quantidade por pacote"
--    para um campo que não via. Afetava Resinit, Acoplado e o produto com
--    "Unidades por pacote".
--
-- Os corpos são os da 0086, com a mesma condição acrescentada onde o fator é
-- escolhido ou exigido.

begin;

create or replace function public.rpc_public_submit_quotation_validated(
  p_token text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_item jsonb;
  v_sqi_id uuid;
  v_product public.products;
  v_required public.product_attribute_definitions;
  v_factor numeric;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Resposta vazia';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sqi_id := (v_item ->> 'supplier_quotation_item_id')::uuid;

    select p.*
    into v_product
    from public.supplier_quotation_items sqi
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id and qi.company_id = sqi.company_id
    join public.products p
      on p.id = qi.product_id and p.company_id = qi.company_id
    where sqi.id = v_sqi_id
      and sqi.company_id = v_token.company_id
      and sqi.round_supplier_id = v_token.round_supplier_id
      and sqi.removed_at is null;

    if v_product.id is null then
      raise exception 'Item não pertence a esta cotação';
    end if;

    if coalesce((v_item ->> 'does_not_supply')::boolean, false) = false
       and coalesce((v_item ->> 'is_available')::boolean, true) = true then
      select pad.*
      into v_required
      from public.product_attribute_definitions pad
      where pad.company_id = v_token.company_id
        and pad.is_active = true
        and pad.is_required = true
        and (pad.product_id = v_product.id or pad.category_id = v_product.category_id)
        -- O fator do produto esconde o da categoria: o link só mostra o do
        -- produto, e exigir o outro barrava o envio (desde a 0111).
        and not (
          pad.is_conversion_factor
          and pad.category_id is not null
          and exists (
            select 1
            from public.product_attribute_definitions own
            where own.company_id = pad.company_id
              and own.product_id = v_product.id
              and own.is_active = true
              and own.is_conversion_factor = true
          )
        )
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(v_item -> 'attributes', '[]'::jsonb)) supplied
          where supplied ->> 'attribute_definition_id' = pad.id::text
            and coalesce(
              nullif(supplied ->> 'value_text', ''),
              nullif(supplied ->> 'value_numeric', ''),
              nullif(supplied ->> 'value_boolean', '')
            ) is not null
        )
      order by pad.sort_order, pad.name
      limit 1;

      if v_required.id is not null then
        raise exception 'Preencha o campo obrigatório: %', v_required.name;
      end if;

      select nullif(supplied ->> 'value_numeric', '')::numeric
      into v_factor
      from public.product_attribute_definitions pad
      join lateral jsonb_array_elements(
        coalesce(v_item -> 'attributes', '[]'::jsonb)
      ) supplied on supplied ->> 'attribute_definition_id' = pad.id::text
      where pad.company_id = v_token.company_id
        and pad.is_active = true
        and pad.is_conversion_factor = true
        and (pad.product_id = v_product.id or pad.category_id = v_product.category_id)
        -- O fator do produto esconde o da categoria: o link só mostra o do
        -- produto, e exigir o outro barrava o envio (desde a 0111).
        and not (
          pad.is_conversion_factor
          and pad.category_id is not null
          and exists (
            select 1
            from public.product_attribute_definitions own
            where own.company_id = pad.company_id
              and own.product_id = v_product.id
              and own.is_active = true
              and own.is_conversion_factor = true
          )
        )
      limit 1;

      if v_factor is not null and v_factor <= 0 then
        raise exception 'A apresentação deve ser maior que zero';
      end if;
    end if;
  end loop;

  return public.rpc_public_submit_quotation(p_token, p_items);
end;
$$;

revoke all on function public.rpc_public_submit_quotation_validated(text,jsonb)
  from public;
grant execute on function public.rpc_public_submit_quotation_validated(text,jsonb)
  to anon, authenticated;


create or replace function public.rpc_record_manual_quotation_item_with_conversion(
  p_company_id uuid,
  p_supplier_quotation_item_id uuid,
  p_quoted_price numeric default null,
  p_does_not_supply boolean default false,
  p_notes text default null,
  p_conversion_attribute_definition_id uuid default null,
  p_conversion_factor numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_item_id uuid;
  v_definition_id uuid;
  v_definition_required boolean;
begin
  v_response_item_id := public.rpc_record_manual_quotation_item(
    p_company_id,
    p_supplier_quotation_item_id,
    p_quoted_price,
    p_does_not_supply,
    p_notes
  );

  if not p_does_not_supply then
    select pad.id, pad.is_required
    into v_definition_id, v_definition_required
    from public.quotation_response_items qri
    join public.supplier_quotation_items sqi
      on sqi.id = qri.supplier_quotation_item_id and sqi.company_id = qri.company_id
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id and qi.company_id = sqi.company_id
    join public.products p
      on p.id = qi.product_id and p.company_id = qi.company_id
    join public.product_attribute_definitions pad
      on pad.company_id = p.company_id
     and pad.is_active = true
     and pad.is_conversion_factor = true
     and (pad.product_id = p.id or pad.category_id = p.category_id)
     -- O fator do produto esconde o da categoria (mesma regra da 0111).
     and not (
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
    where qri.id = v_response_item_id
      and qri.company_id = p_company_id
    limit 1;

    if coalesce(v_definition_required, false) and p_conversion_factor is null then
      raise exception 'Informe a apresentação do produto';
    end if;

    if p_conversion_factor is not null then
      if p_conversion_factor <= 0 then
        raise exception 'A apresentação deve ser maior que zero';
      end if;
      if p_conversion_attribute_definition_id is distinct from v_definition_id then
        raise exception 'Fator de conversão inválido para este produto';
      end if;

      insert into public.quotation_response_attribute_values (
        company_id, quotation_response_item_id, attribute_definition_id,
        value_numeric
      ) values (
        p_company_id, v_response_item_id,
        p_conversion_attribute_definition_id, p_conversion_factor
      );
    end if;
  end if;

  return v_response_item_id;
end;
$$;

revoke all on function public.rpc_record_manual_quotation_item_with_conversion(
  uuid,uuid,numeric,boolean,text,uuid,numeric
) from public, anon;
grant execute on function public.rpc_record_manual_quotation_item_with_conversion(
  uuid,uuid,numeric,boolean,text,uuid,numeric
) to authenticated;

create or replace function public.rpc_correct_quotation_item_with_conversion(
  p_company_id uuid,
  p_quotation_response_item_id uuid,
  p_quoted_price numeric default null,
  p_is_available boolean default null,
  p_does_not_supply boolean default null,
  p_notes text default null,
  p_reason text default null,
  p_conversion_attribute_definition_id uuid default null,
  p_conversion_factor numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_definition_id uuid;
  v_required boolean;
  v_old_factor numeric;
  v_final_does_not_supply boolean;
  v_final_available boolean;
begin
  v_result := public.rpc_correct_quotation_response_item(
    p_company_id,
    p_quotation_response_item_id,
    p_quoted_price,
    p_is_available,
    p_does_not_supply,
    p_notes,
    p_reason
  );

  select pad.id, pad.is_required, rav.value_numeric,
         qri.does_not_supply, qri.is_available
  into v_definition_id, v_required, v_old_factor,
       v_final_does_not_supply, v_final_available
  from public.quotation_response_items qri
  join public.supplier_quotation_items sqi
    on sqi.id = qri.supplier_quotation_item_id and sqi.company_id = qri.company_id
  join public.quotation_items qi
    on qi.id = sqi.quotation_item_id and qi.company_id = sqi.company_id
  join public.products p
    on p.id = qi.product_id and p.company_id = qi.company_id
  join public.product_attribute_definitions pad
    on pad.company_id = p.company_id
   and pad.is_active = true
   and pad.is_conversion_factor = true
   and (pad.product_id = p.id or pad.category_id = p.category_id)
   -- O fator do produto esconde o da categoria (mesma regra da 0111).
   and not (
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
  left join public.quotation_response_attribute_values rav
    on rav.company_id = qri.company_id
   and rav.quotation_response_item_id = qri.id
   and rav.attribute_definition_id = pad.id
  where qri.id = p_quotation_response_item_id
    and qri.company_id = p_company_id
  limit 1;

  if p_conversion_factor is not null then
    if p_conversion_factor <= 0 then
      raise exception 'A apresentação deve ser maior que zero';
    end if;
    if p_conversion_attribute_definition_id is distinct from v_definition_id then
      raise exception 'Fator de conversão inválido para este produto';
    end if;

    insert into public.quotation_response_attribute_values (
      company_id, quotation_response_item_id, attribute_definition_id,
      value_numeric
    ) values (
      p_company_id, p_quotation_response_item_id,
      v_definition_id, p_conversion_factor
    )
    on conflict (quotation_response_item_id, attribute_definition_id)
    do update set value_numeric = excluded.value_numeric,
                  value_text = null,
                  value_boolean = null;

    if p_conversion_factor is distinct from v_old_factor then
      insert into public.response_item_corrections (
        company_id, quotation_response_item_id, field_name,
        old_value, new_value, reason, corrected_by
      ) values (
        p_company_id, p_quotation_response_item_id,
        'conversion_factor', to_jsonb(v_old_factor),
        to_jsonb(p_conversion_factor), p_reason, auth.uid()
      );
    end if;
  elsif v_required
    and not coalesce(v_final_does_not_supply, false)
    and coalesce(v_final_available, true)
    and v_old_factor is null then
    raise exception 'Informe a apresentação do produto';
  end if;

  return v_result || jsonb_build_object(
    'conversion_factor', coalesce(p_conversion_factor, v_old_factor)
  );
end;
$$;

revoke all on function public.rpc_correct_quotation_item_with_conversion(
  uuid,uuid,numeric,boolean,boolean,text,text,uuid,numeric
) from public, anon;
grant execute on function public.rpc_correct_quotation_item_with_conversion(
  uuid,uuid,numeric,boolean,boolean,text,text,uuid,numeric
) to authenticated;

commit;
