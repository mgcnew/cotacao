-- 0014_public_supplier_rpcs.sql
-- Acesso público controlado por token para cotação e confirmação de pedido.
--
-- Somente estas funções recebem EXECUTE para `anon`.
-- Tabelas operacionais continuam sem grants para anon.

begin;

-- ============================================================
-- HELPER: HASH DE TOKEN
-- ============================================================

create or replace function private.hash_public_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function private.resolve_public_token(
  p_token text,
  p_purpose text
)
returns public.public_access_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
begin
  if nullif(p_token, '') is null then
    raise exception 'Token inválido' using errcode = '42501';
  end if;

  select t.*
  into v_token
  from public.public_access_tokens t
  where t.token_hash = private.hash_public_token(p_token)
    and t.purpose = p_purpose
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_token.id is null then
    raise exception 'Acesso inválido ou expirado' using errcode = '42501';
  end if;

  update public.public_access_tokens
  set last_accessed_at = now()
  where id = v_token.id;

  return v_token;
end;
$$;

revoke all on function private.hash_public_token(text) from public, anon, authenticated;
revoke all on function private.resolve_public_token(text,text) from public, anon, authenticated;

-- ============================================================
-- RPC PÚBLICA: LER COTAÇÃO
-- ============================================================

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
          'purchase_unit', jsonb_build_object(
            'id', pu.id, 'code', pu.code, 'symbol', pu.symbol
          ),
          'pricing_unit', jsonb_build_object(
            'id', pru.id, 'code', pru.code, 'symbol', pru.symbol
          ),
          'comparison_unit', case
            when cu.id is null then null
            else jsonb_build_object('id', cu.id, 'code', cu.code, 'symbol', cu.symbol)
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
                  else jsonb_build_object('id', au.id, 'symbol', au.symbol)
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

-- ============================================================
-- RPC PÚBLICA: ENVIAR/COMPLEMENTAR RESPOSTA
--
-- p_items array:
-- [{
--   "supplier_quotation_item_id":"...",
--   "quoted_price":12.30,
--   "is_available":true,
--   "does_not_supply":false,
--   "notes":null,
--   "attributes":[
--      {"attribute_definition_id":"...", "value_numeric":500}
--   ]
-- }]
--
-- Itens já respondidos não podem ser sobrescritos pelo fornecedor.
-- Ele pode complementar itens ainda sem resposta.
-- ============================================================

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

    if coalesce((v_item ->> 'does_not_supply')::boolean, false) = false
       and nullif(v_item ->> 'quoted_price', '') is null then
      raise exception 'Preço é obrigatório quando o produto é fornecido';
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

-- ============================================================
-- RPC PÚBLICA: LER PEDIDO/REVISÃO
-- ============================================================

create or replace function public.rpc_public_get_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_result jsonb;
begin
  v_token := private.resolve_public_token(p_token, 'order_confirmation');

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
    'order', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status
    ),
    'revision', jsonb_build_object(
      'id', r.id,
      'revision_number', r.revision_number,
      'status', r.status,
      'delivery_due_date', r.delivery_due_date,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'order_revision_item_id', ori.id,
            'product_id', ori.product_id,
            'product_name', ori.product_name_snapshot,
            'requested_quantity', ori.requested_quantity,
            'purchase_unit', jsonb_build_object(
              'id', pu.id, 'symbol', pu.symbol, 'code', pu.code
            ),
            'pricing_unit', jsonb_build_object(
              'id', pru.id, 'symbol', pru.symbol, 'code', pru.code
            ),
            'estimated_pricing_quantity', ori.estimated_pricing_quantity,
            'agreed_price', ori.agreed_price,
            'notes', ori.notes
          )
          order by ori.created_at
        )
        from public.order_revision_items ori
        join public.units pu
          on pu.id = ori.purchase_unit_id
         and pu.company_id = ori.company_id
        join public.units pru
          on pru.id = ori.pricing_unit_id
         and pru.company_id = ori.company_id
        where ori.order_revision_id = r.id
          and ori.company_id = r.company_id
      ), '[]'::jsonb)
    )
  )
  into v_result
  from public.order_revisions r
  join public.orders o
    on o.id = r.order_id
   and o.company_id = r.company_id
  join public.companies c
    on c.id = r.company_id
  join public.suppliers s
    on s.id = o.supplier_id
   and s.company_id = o.company_id
  where r.id = v_token.order_revision_id
    and r.company_id = v_token.company_id;

  if v_result is null then
    raise exception 'Pedido não encontrado';
  end if;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_order(text) from public;
grant execute on function public.rpc_public_get_order(text) to anon, authenticated;

-- ============================================================
-- RPC PÚBLICA: CONFIRMAR REVISÃO DO PEDIDO
-- Idempotente quando já confirmada.
-- ============================================================

create or replace function public.rpc_public_confirm_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_order_id uuid;
  v_revision_status text;
begin
  v_token := private.resolve_public_token(p_token, 'order_confirmation');

  select r.order_id, r.status
  into v_order_id, v_revision_status
  from public.order_revisions r
  where r.id = v_token.order_revision_id
    and r.company_id = v_token.company_id
  for update;

  if v_order_id is null then
    raise exception 'Revisão inexistente';
  end if;

  if v_revision_status = 'confirmed' then
    return jsonb_build_object(
      'order_id', v_order_id,
      'order_revision_id', v_token.order_revision_id,
      'status', 'confirmed'
    );
  end if;

  if v_revision_status <> 'sent' then
    raise exception 'Esta revisão não está disponível para confirmação';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = v_order_id
      and o.company_id = v_token.company_id
      and o.current_revision_id = v_token.order_revision_id
      and o.supplier_id = v_token.supplier_id
  ) then
    raise exception 'Esta revisão não é mais a revisão vigente';
  end if;

  update public.order_revisions
  set status = 'superseded'
  where company_id = v_token.company_id
    and order_id = v_order_id
    and id <> v_token.order_revision_id
    and status = 'confirmed';

  update public.order_revisions
  set status = 'confirmed',
      confirmed_at = now()
  where id = v_token.order_revision_id
    and company_id = v_token.company_id;

  update public.orders
  set status = 'awaiting_delivery',
      current_revision_id = v_token.order_revision_id
  where id = v_order_id
    and company_id = v_token.company_id;

  perform private.emit_domain_event(
    v_token.company_id,
    'order.confirmed',
    'order',
    v_order_id,
    jsonb_build_object(
      'order_revision_id', v_token.order_revision_id
    ),
    'supplier',
    null,
    v_token.supplier_id
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', v_token.order_revision_id,
    'status', 'confirmed'
  );
end;
$$;

revoke all on function public.rpc_public_confirm_order(text) from public;
grant execute on function public.rpc_public_confirm_order(text)
to anon, authenticated;

-- ============================================================
-- RPC PÚBLICA: INFORMAR DIVERGÊNCIA DO PEDIDO
--
-- p_divergences array:
-- [{
--   "order_revision_item_id":"..." | null,
--   "type":"quantity|price|delivery_date|availability|specification|other",
--   "current_value": {...},
--   "proposed_value": {...},
--   "notes":"..."
-- }]
-- ============================================================

create or replace function public.rpc_public_report_order_divergence(
  p_token text,
  p_divergences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.public_access_tokens;
  v_order_id uuid;
  v_revision_status text;
  v_item jsonb;
  v_count integer := 0;
begin
  v_token := private.resolve_public_token(p_token, 'order_confirmation');

  if jsonb_typeof(p_divergences) <> 'array'
     or jsonb_array_length(p_divergences) = 0 then
    raise exception 'Informe ao menos uma divergência';
  end if;

  select r.order_id, r.status
  into v_order_id, v_revision_status
  from public.order_revisions r
  where r.id = v_token.order_revision_id
    and r.company_id = v_token.company_id
  for update;

  if v_order_id is null or v_revision_status <> 'sent' then
    raise exception 'Revisão não está disponível para divergência';
  end if;

  if not exists (
    select 1 from public.orders o
    where o.id = v_order_id
      and o.company_id = v_token.company_id
      and o.current_revision_id = v_token.order_revision_id
      and o.supplier_id = v_token.supplier_id
  ) then
    raise exception 'Esta revisão não é mais vigente';
  end if;

  for v_item in select value from jsonb_array_elements(p_divergences)
  loop
    if (v_item ->> 'type') not in (
      'quantity','price','delivery_date','availability','specification','other'
    ) then
      raise exception 'Tipo de divergência inválido';
    end if;

    if nullif(v_item ->> 'order_revision_item_id', '') is not null
       and not exists (
         select 1
         from public.order_revision_items ori
         where ori.id = (v_item ->> 'order_revision_item_id')::uuid
           and ori.company_id = v_token.company_id
           and ori.order_revision_id = v_token.order_revision_id
       ) then
      raise exception 'Item não pertence à revisão';
    end if;

    insert into public.order_divergences (
      company_id,
      order_id,
      order_revision_id,
      order_revision_item_id,
      type,
      current_value,
      proposed_value,
      notes,
      status
    )
    values (
      v_token.company_id,
      v_order_id,
      v_token.order_revision_id,
      nullif(v_item ->> 'order_revision_item_id', '')::uuid,
      v_item ->> 'type',
      v_item -> 'current_value',
      v_item -> 'proposed_value',
      nullif(v_item ->> 'notes', ''),
      'pending'
    );

    v_count := v_count + 1;
  end loop;

  update public.order_revisions
  set status = 'contested'
  where id = v_token.order_revision_id
    and company_id = v_token.company_id;

  perform private.emit_domain_event(
    v_token.company_id,
    'order.divergence_created',
    'order',
    v_order_id,
    jsonb_build_object(
      'order_revision_id', v_token.order_revision_id,
      'count', v_count
    ),
    'supplier',
    null,
    v_token.supplier_id
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', v_token.order_revision_id,
    'status', 'contested',
    'divergences_created', v_count
  );
end;
$$;

revoke all on function public.rpc_public_report_order_divergence(text,jsonb) from public;
grant execute on function public.rpc_public_report_order_divergence(text,jsonb)
to anon, authenticated;

commit;
