-- 0072_quotation_temporary_unavailability.sql
--
-- "Sem disponibilidade agora" é uma resposta completa e diferente de
-- "não trabalho com este produto". A interface já enviava is_available=false,
-- mas a RPC antiga ainda exigia preço sempre que does_not_supply=false.

begin;

create or replace function public.rpc_public_submit_quotation(
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
  v_response_id uuid;
  v_item jsonb;
  v_attr jsonb;
  v_sqi_id uuid;
  v_qri_id uuid;
  v_product_id uuid;
  v_total_items integer;
  v_answered_items integer;
  v_status text;
begin
  v_token := private.resolve_public_token(p_token, 'quotation_response');

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Resposta vazia';
  end if;

  insert into public.quotation_responses (
    company_id,
    round_supplier_id,
    source,
    status,
    started_at
  )
  values (
    v_token.company_id,
    v_token.round_supplier_id,
    'supplier_link',
    'in_progress',
    now()
  )
  on conflict (round_supplier_id)
  do update set
    started_at = coalesce(public.quotation_responses.started_at, excluded.started_at)
  returning id into v_response_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sqi_id := (v_item ->> 'supplier_quotation_item_id')::uuid;

    select qi.product_id
    into v_product_id
    from public.supplier_quotation_items sqi
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id
     and qi.company_id = sqi.company_id
    where sqi.id = v_sqi_id
      and sqi.company_id = v_token.company_id
      and sqi.round_supplier_id = v_token.round_supplier_id
      and sqi.removed_at is null;

    if v_product_id is null then
      raise exception 'Item não pertence a esta cotação';
    end if;

    if exists (
      select 1
      from public.quotation_response_items qri
      where qri.company_id = v_token.company_id
        and qri.quotation_response_id = v_response_id
        and qri.supplier_quotation_item_id = v_sqi_id
    ) then
      raise exception 'Item já foi respondido; contate o comprador para correção';
    end if;

    -- Preço só é obrigatório quando o fornecedor declarou disponibilidade.
    -- Ausência de is_available mantém o comportamento seguro dos clientes
    -- antigos: é tratada como disponível e continua exigindo preço.
    if coalesce((v_item ->> 'does_not_supply')::boolean, false) = false
       and coalesce((v_item ->> 'is_available')::boolean, true) = true
       and nullif(v_item ->> 'quoted_price', '') is null then
      raise exception 'Preço é obrigatório quando o produto está disponível';
    end if;

    if coalesce((v_item ->> 'is_available')::boolean, true) = false
       and nullif(v_item ->> 'quoted_price', '') is not null then
      raise exception 'Produto indisponível não deve ter preço';
    end if;

    insert into public.quotation_response_items (
      company_id,
      quotation_response_id,
      supplier_quotation_item_id,
      quoted_price,
      is_available,
      does_not_supply,
      notes
    )
    values (
      v_token.company_id,
      v_response_id,
      v_sqi_id,
      nullif(v_item ->> 'quoted_price', '')::numeric,
      nullif(v_item ->> 'is_available', '')::boolean,
      coalesce((v_item ->> 'does_not_supply')::boolean, false),
      nullif(v_item ->> 'notes', '')
    )
    returning id into v_qri_id;

    if jsonb_typeof(v_item -> 'attributes') = 'array' then
      for v_attr in select value from jsonb_array_elements(v_item -> 'attributes')
      loop
        if not exists (
          select 1
          from public.product_attribute_definitions pad
          join public.products p
            on p.id = v_product_id
           and p.company_id = pad.company_id
          where pad.id = (v_attr ->> 'attribute_definition_id')::uuid
            and pad.company_id = v_token.company_id
            and pad.is_active = true
            and (pad.product_id = p.id or pad.category_id = p.category_id)
        ) then
          raise exception 'Atributo não permitido para este produto';
        end if;

        insert into public.quotation_response_attribute_values (
          company_id,
          quotation_response_item_id,
          attribute_definition_id,
          value_text,
          value_numeric,
          value_boolean
        )
        values (
          v_token.company_id,
          v_qri_id,
          (v_attr ->> 'attribute_definition_id')::uuid,
          nullif(v_attr ->> 'value_text', ''),
          nullif(v_attr ->> 'value_numeric', '')::numeric,
          nullif(v_attr ->> 'value_boolean', '')::boolean
        );
      end loop;
    end if;

    if coalesce((v_item ->> 'does_not_supply')::boolean, false) then
      insert into public.supplier_products (
        company_id, supplier_id, product_id, status, source
      )
      values (
        v_token.company_id, v_token.supplier_id, v_product_id,
        'does_not_supply', 'supplier_declared'
      )
      on conflict (company_id, supplier_id, product_id)
      do update set
        status = 'does_not_supply',
        source = 'supplier_declared',
        updated_at = now();
    else
      insert into public.supplier_products (
        company_id, supplier_id, product_id, status, source
      )
      values (
        v_token.company_id, v_token.supplier_id, v_product_id,
        'confirmed', 'quotation_response'
      )
      on conflict (company_id, supplier_id, product_id)
      do update set
        status = 'confirmed',
        source = 'quotation_response',
        updated_at = now();
    end if;
  end loop;

  select count(*)
  into v_total_items
  from public.supplier_quotation_items sqi
  where sqi.company_id = v_token.company_id
    and sqi.round_supplier_id = v_token.round_supplier_id
    and sqi.removed_at is null;

  select count(*)
  into v_answered_items
  from public.quotation_response_items qri
  where qri.company_id = v_token.company_id
    and qri.quotation_response_id = v_response_id;

  v_status := case
    when v_answered_items >= v_total_items then 'completed'
    else 'partial'
  end;

  update public.quotation_responses
  set status = v_status,
      submitted_at = now()
  where id = v_response_id
    and company_id = v_token.company_id;

  if v_status = 'completed' then
    update public.round_suppliers
    set completed_at = now()
    where id = v_token.round_supplier_id
      and company_id = v_token.company_id;
  end if;

  perform private.emit_domain_event(
    v_token.company_id,
    'quotation.response_submitted',
    'round_supplier',
    v_token.round_supplier_id,
    jsonb_build_object(
      'quotation_response_id', v_response_id,
      'status', v_status,
      'answered_items', v_answered_items,
      'total_items', v_total_items
    ),
    'supplier',
    null,
    v_token.supplier_id
  );

  return jsonb_build_object(
    'quotation_response_id', v_response_id,
    'status', v_status,
    'answered_items', v_answered_items,
    'total_items', v_total_items
  );
end;
$$;

revoke all on function public.rpc_public_submit_quotation(text,jsonb) from public;
grant execute on function public.rpc_public_submit_quotation(text,jsonb)
to anon, authenticated;

commit;
