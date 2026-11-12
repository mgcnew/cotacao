-- 0131_supplier_purchase_form_quantity.sql
-- A quantidade de uma forma de compra pode variar por fornecedor: a caixa de
-- um tem 12, a de outro tem 10. O número do cadastro (0127) passa a ser o
-- padrão, e cada fornecedor confirma ou corrige o seu na resposta.
--
-- Sem isso a comparação dividia a caixa de 10 por 12 e o fornecedor parecia
-- mais barato do que era. O mesmo vale para o pedido: o item gerado pela
-- rodada leva o número de quem venceu, e é com ele que a nota converte e o
-- consumo conta.

begin;

alter table public.quotation_response_items
  add column form_base_per_unit numeric(18,6)
    check (form_base_per_unit is null or form_base_per_unit > 0);

comment on column public.quotation_response_items.form_base_per_unit is
  'Quanto da unidade-base vem em 1 da forma de compra do item, segundo este fornecedor. Nulo: vale o padrão do item.';

-- ------------------------------------------------------ link do fornecedor

-- Igual à 0128, devolvendo o que o fornecedor já respondeu sobre a forma.
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
          -- Forma de compra escolhida no item (0128): "1 cx = 12 un", com a
          -- base em comparison_unit. Nula quando o item usa a forma padrão.
          'purchase_form', case
            when qi.purchase_form_id is null then null
            else jsonb_build_object(
              'unit_quantity', qi.form_unit_quantity,
              'base_quantity', qi.form_base_quantity,
              -- O que este fornecedor já disse que vem na forma dele (0131).
              'supplier_base_per_unit', (
                select qri.form_base_per_unit
                from public.quotation_responses qr
                join public.quotation_response_items qri
                  on qri.quotation_response_id = qr.id
                 and qri.company_id = qr.company_id
                where qr.round_supplier_id = v_token.round_supplier_id
                  and qr.company_id = v_token.company_id
                  and qri.supplier_quotation_item_id = sqi.id
                limit 1
              )
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


revoke all on function public.rpc_public_get_quotation(text) from public;
grant execute on function public.rpc_public_get_quotation(text) to anon, authenticated;

-- Igual à 0128, gravando a quantidade da forma informada no envio.
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
  v_form_id uuid;
  v_result jsonb;
  v_base_per_unit numeric;
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

    -- Item numa forma de compra (0128) já traz a equivalência; o fator de
    -- embalagem do produto ou da categoria fala de outra forma e não se pede.
    select qi.purchase_form_id
    into v_form_id
    from public.supplier_quotation_items sqi
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id and qi.company_id = sqi.company_id
    where sqi.id = v_sqi_id
      and sqi.company_id = v_token.company_id;

    if coalesce((v_item ->> 'does_not_supply')::boolean, false) = false
       and coalesce((v_item ->> 'is_available')::boolean, true) = true then
      select pad.*
      into v_required
      from public.product_attribute_definitions pad
      where pad.company_id = v_token.company_id
        and pad.is_active = true
        and pad.is_required = true
        and not (pad.is_conversion_factor and v_form_id is not null)
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

  v_result := public.rpc_public_submit_quotation(p_token, p_items);

  -- Quantidade que vem na forma deste fornecedor (0131): "a minha caixa tem
  -- 10". Grava-se depois do envio porque é a resposta que acabou de nascer.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_base_per_unit := nullif(v_item ->> 'form_base_per_unit', '')::numeric;
    if v_base_per_unit is null then
      continue;
    end if;
    if v_base_per_unit <= 0 then
      raise exception 'A quantidade em cada embalagem deve ser maior que zero';
    end if;

    update public.quotation_response_items qri
    set form_base_per_unit = v_base_per_unit
    from public.quotation_responses qr,
         public.supplier_quotation_items sqi,
         public.quotation_items qi
    where qri.supplier_quotation_item_id = (v_item ->> 'supplier_quotation_item_id')::uuid
      and qri.company_id = v_token.company_id
      and qr.id = qri.quotation_response_id
      and qr.company_id = qri.company_id
      and qr.round_supplier_id = v_token.round_supplier_id
      and sqi.id = qri.supplier_quotation_item_id
      and sqi.company_id = qri.company_id
      and qi.id = sqi.quotation_item_id
      and qi.company_id = sqi.company_id
      and qi.purchase_form_id is not null;
  end loop;

  return v_result;
end;
$$;


revoke all on function public.rpc_public_submit_quotation_validated(text,jsonb)
  from public;
grant execute on function public.rpc_public_submit_quotation_validated(text,jsonb)
  to anon, authenticated;

-- ---------------------------------------------------------- comprador

-- Quem lança ou corrige o preço pelo fornecedor também diz quanto vem na
-- forma dele. Mesmas permissões e mesma trava do item que virou pedido.
create or replace function public.rpc_set_response_item_form_quantity(
  p_company_id uuid,
  p_quotation_response_item_id uuid,
  p_base_per_unit numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.has_permission(p_company_id, 'quotation_response.correct')
    or private.has_permission(p_company_id, 'quotation_response.manual_create')
  ) then
    raise exception 'Permissão negada';
  end if;

  if p_base_per_unit is not null and p_base_per_unit <= 0 then
    raise exception 'A quantidade em cada embalagem deve ser maior que zero';
  end if;

  if not exists (
    select 1
    from public.quotation_response_items qri
    join public.supplier_quotation_items sqi
      on sqi.id = qri.supplier_quotation_item_id
     and sqi.company_id = qri.company_id
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id
     and qi.company_id = sqi.company_id
    where qri.id = p_quotation_response_item_id
      and qri.company_id = p_company_id
      and qi.purchase_form_id is not null
  ) then
    raise exception 'Este item não está numa forma de compra';
  end if;

  -- A correção manda o campo mesmo sem mudá-lo; igual não é alteração e não
  -- esbarra na trava de quem já virou pedido.
  if exists (
    select 1
    from public.quotation_response_items qri
    join public.supplier_quotation_items sqi
      on sqi.id = qri.supplier_quotation_item_id
     and sqi.company_id = qri.company_id
    join public.quotation_items qi
      on qi.id = sqi.quotation_item_id
     and qi.company_id = sqi.company_id
    where qri.id = p_quotation_response_item_id
      and qri.company_id = p_company_id
      and coalesce(
        qri.form_base_per_unit,
        qi.form_base_quantity / qi.form_unit_quantity
      ) = p_base_per_unit
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.purchase_allocations pa
    where pa.company_id = p_company_id
      and pa.quotation_response_item_id = p_quotation_response_item_id
      and pa.status = 'confirmed'
  ) then
    raise exception 'Este item já virou pedido para este fornecedor; ajuste pelo pedido';
  end if;

  update public.quotation_response_items
  set form_base_per_unit = p_base_per_unit,
      updated_at = now()
  where id = p_quotation_response_item_id
    and company_id = p_company_id
    and form_base_per_unit is distinct from p_base_per_unit;
end;
$$;

revoke all on function public.rpc_set_response_item_form_quantity(uuid, uuid, numeric)
  from public, anon;
grant execute on function public.rpc_set_response_item_form_quantity(uuid, uuid, numeric)
  to authenticated;

-- --------------------------------------------------------------- pedido

-- Igual à 0129; o item que vem de uma alocação leva o número do vencedor.
create or replace function private.fill_order_item_purchase_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.product_purchase_forms%rowtype;
  v_base_per_unit numeric;
begin
  if new.purchase_form_id is not null then
    select form.* into v_form
    from public.product_purchase_forms form
    where form.company_id = new.company_id
      and form.id = new.purchase_form_id;

    if not found or v_form.product_id <> new.product_id then
      raise exception 'A forma de compra não pertence a este produto';
    end if;
  else
    select form.* into v_form
    from public.product_purchase_forms form
    where form.company_id = new.company_id
      and form.product_id = new.product_id
      and form.unit_id = new.purchase_unit_id;
  end if;

  if v_form.id is null then
    new.purchase_form_id := null;
    new.form_unit_quantity := null;
    new.form_base_quantity := null;
    return new;
  end if;

  -- Compra e preço na forma, comparação na base, como na rodada (0128).
  new.purchase_form_id := v_form.id;
  new.purchase_unit_id := v_form.unit_id;
  new.pricing_unit_id := v_form.unit_id;
  new.comparison_unit_id := v_form.base_unit_id;
  new.form_unit_quantity := v_form.unit_quantity;
  new.form_base_quantity := v_form.base_quantity;

  -- Vindo da rodada, vale o que o fornecedor vencedor disse que vem na forma
  -- dele (0131), e não o padrão do cadastro.
  if new.purchase_allocation_id is not null then
    select qri.form_base_per_unit
    into v_base_per_unit
    from public.purchase_allocations allocation
    join public.quotation_response_items qri
      on qri.company_id = allocation.company_id
     and qri.id = allocation.quotation_response_item_id
    where allocation.company_id = new.company_id
      and allocation.id = new.purchase_allocation_id;

    if v_base_per_unit is not null then
      new.form_unit_quantity := 1;
      new.form_base_quantity := v_base_per_unit;
    end if;
  end if;
  new.estimated_pricing_quantity := null;
  return new;
end;
$$;


revoke all on function private.fill_order_item_purchase_form()
from public, anon, authenticated;

commit;
