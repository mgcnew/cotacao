-- 0128_purchase_forms_in_list_and_round.sql
-- Etapa 2 das formas de compra (0127): a lista e a rodada passam a pedir o
-- produto numa forma escolhida — caixa, display, fardo — além da padrão.
--
-- O item da rodada copia a equivalência no momento em que entra ("1 cx = 12
-- un"), como já copia as unidades (0007). A comparação divide o preço da forma
-- por essa equivalência e põe tudo na unidade-base do produto. Quem preenche
-- as unidades do item é o gatilho, a partir da forma: assim nenhum dos
-- caminhos que inserem item (tela, modelo, lista) consegue gravar a forma com
-- a unidade errada.
--
-- Uma forma já usada fica travada: não muda de quantidade nem sai do produto,
-- pelo mesmo motivo da trava de unidades (0102).
--
-- Embalagens ficam de fora. Elas já comparam pela quantidade que o fornecedor
-- informa em cada resposta (0086, 0111), e as duas regras juntas pediriam ao
-- fornecedor duas equivalências para o mesmo item.

begin;

-- ---------------------------------------------------------------- lista

alter table public.shopping_list_items
  add column purchase_form_id uuid,
  add constraint shopping_list_items_purchase_form_fkey
    foreign key (company_id, purchase_form_id)
    references public.product_purchase_forms(company_id, id) on delete restrict;

create index shopping_list_items_purchase_form_idx
on public.shopping_list_items(purchase_form_id)
where purchase_form_id is not null;

-- O mesmo produto pode estar na lista uma vez por forma: "2 cx" e "5 un".
drop index public.shopping_list_items_pending_product_uidx;
create unique index shopping_list_items_pending_product_uidx
on public.shopping_list_items(
  shopping_list_id,
  product_id,
  coalesce(purchase_form_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where status = 'pending';

create or replace function private.fill_shopping_list_item_purchase_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.product_purchase_forms%rowtype;
begin
  if new.purchase_form_id is null then
    return new;
  end if;

  select form.* into v_form
  from public.product_purchase_forms form
  where form.company_id = new.company_id
    and form.id = new.purchase_form_id;

  if not found or v_form.product_id <> new.product_id then
    raise exception 'A forma de compra não pertence a este produto';
  end if;

  new.purchase_unit_id := v_form.unit_id;
  return new;
end;
$$;

revoke all on function private.fill_shopping_list_item_purchase_form()
from public, anon, authenticated;

create trigger shopping_list_items_fill_purchase_form
before insert or update of purchase_form_id, product_id
on public.shopping_list_items
for each row execute function private.fill_shopping_list_item_purchase_form();

-- --------------------------------------------------------------- rodada

alter table public.quotation_items
  add column purchase_form_id uuid,
  -- `form_unit_quantity` da forma = `form_base_quantity` da base, copiados
  -- da forma quando o item entrou. A comparação lê daqui, não da forma.
  add column form_unit_quantity numeric(18,6),
  add column form_base_quantity numeric(18,6),
  add constraint quotation_items_purchase_form_fkey
    foreign key (company_id, purchase_form_id)
    references public.product_purchase_forms(company_id, id) on delete restrict,
  add constraint quotation_items_purchase_form_quantities_check
    check (
      (purchase_form_id is null
        and form_unit_quantity is null and form_base_quantity is null)
      or (purchase_form_id is not null
        and form_unit_quantity > 0 and form_base_quantity > 0)
    );

create index quotation_items_purchase_form_idx
on public.quotation_items(purchase_form_id)
where purchase_form_id is not null;

create or replace function private.fill_quotation_item_purchase_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.product_purchase_forms%rowtype;
begin
  if new.purchase_form_id is null then
    new.form_unit_quantity := null;
    new.form_base_quantity := null;
    return new;
  end if;

  select form.* into v_form
  from public.product_purchase_forms form
  where form.company_id = new.company_id
    and form.id = new.purchase_form_id;

  if not found or v_form.product_id <> new.product_id then
    raise exception 'A forma de compra não pertence a este produto';
  end if;

  -- Compra e preço na forma, comparação na base: o fornecedor cota a caixa, e
  -- a comparação divide pela equivalência.
  new.purchase_unit_id := v_form.unit_id;
  new.pricing_unit_id := v_form.unit_id;
  new.comparison_unit_id := v_form.base_unit_id;
  new.form_unit_quantity := v_form.unit_quantity;
  new.form_base_quantity := v_form.base_quantity;
  new.estimated_conversion_rate := null;
  new.estimated_pricing_quantity := null;
  return new;
end;
$$;

revoke all on function private.fill_quotation_item_purchase_form()
from public, anon, authenticated;

create trigger quotation_items_fill_purchase_form
before insert or update of purchase_form_id, product_id
on public.quotation_items
for each row execute function private.fill_quotation_item_purchase_form();

-- --------------------------------------------------- trava e embalagens

create or replace function public.rpc_sync_product_purchase_forms(
  p_company_id uuid,
  p_product_id uuid,
  p_forms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_base uuid;
  v_form jsonb;
  v_unit_id uuid;
  v_unit_quantity numeric;
  v_base_quantity numeric;
  v_seen uuid[] := '{}';
  v_used record;
begin
  perform private.require_permission(p_company_id, 'product.update');

  if jsonb_typeof(coalesce(p_forms, '[]'::jsonb)) <> 'array' then
    raise exception 'Formas de compra inválidas';
  end if;

  select product.*
  into v_product
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if v_product.purpose = 'packaging'
     and jsonb_array_length(coalesce(p_forms, '[]'::jsonb)) > 0 then
    raise exception 'Embalagens já comparam pela quantidade que o fornecedor informa em cada cotação, e não usam outras formas de compra';
  end if;

  v_base := coalesce(v_product.comparison_unit_id, v_product.pricing_unit_id);

  for v_form in select value from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb))
  loop
    begin
      v_unit_id := (v_form->>'unitId')::uuid;
      v_unit_quantity := (v_form->>'unitQuantity')::numeric;
      v_base_quantity := (v_form->>'baseQuantity')::numeric;
    exception when others then
      raise exception 'Forma de compra com unidade ou quantidade inválida';
    end;

    if v_unit_id is null then
      raise exception 'Escolha a unidade de cada forma de compra';
    end if;
    if v_unit_quantity is null or v_unit_quantity <= 0
       or v_base_quantity is null or v_base_quantity <= 0 then
      raise exception 'Informe quanto cada forma de compra contém, com números maiores que zero';
    end if;
    if v_unit_id = any(v_seen) then
      raise exception 'A mesma unidade aparece em duas formas de compra';
    end if;
    if v_unit_id = v_base then
      raise exception 'A unidade-base do produto não precisa de forma de compra própria';
    end if;
    if v_unit_id = v_product.purchase_unit_id then
      raise exception 'A unidade de compra do produto já é a forma padrão';
    end if;

    if not exists (
      select 1
      from public.units unit
      where unit.company_id = p_company_id
        and unit.id = v_unit_id
        and (
          unit.is_active
          or exists (
            select 1 from public.product_purchase_forms form
            where form.company_id = p_company_id
              and form.product_id = p_product_id
              and form.unit_id = v_unit_id
          )
        )
    ) then
      raise exception 'Escolha uma unidade ativa desta empresa';
    end if;

    v_seen := v_seen || v_unit_id;
  end loop;

  -- Forma já usada em lista ou rodada não muda nem sai: o número pedido e o
  -- preço cotado foram escritos olhando para ela.
  for v_used in
    select form.id, form.unit_id, form.unit_quantity, form.base_quantity,
           unit.symbol
    from public.product_purchase_forms form
    join public.units unit
      on unit.company_id = form.company_id and unit.id = form.unit_id
    where form.company_id = p_company_id
      and form.product_id = p_product_id
      and (
        exists (
          select 1 from public.shopping_list_items item
          where item.company_id = form.company_id
            and item.purchase_form_id = form.id
        )
        or exists (
          select 1 from public.quotation_items item
          where item.company_id = form.company_id
            and item.purchase_form_id = form.id
        )
      )
  loop
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb)) wanted
      where (wanted->>'unitId')::uuid = v_used.unit_id
        and (wanted->>'unitQuantity')::numeric = v_used.unit_quantity
        and (wanted->>'baseQuantity')::numeric = v_used.base_quantity
    ) or exists (
      select 1 from public.product_purchase_forms form
      where form.id = v_used.id and form.base_unit_id <> v_base
    ) then
      raise exception 'A forma % já foi usada em lista ou rodada e não pode mais ser alterada nem removida', v_used.symbol;
    end if;
  end loop;

  for v_form in select value from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb))
  loop
    insert into public.product_purchase_forms (
      company_id, product_id, unit_id, unit_quantity, base_quantity,
      base_unit_id, created_by
    )
    values (
      p_company_id, p_product_id, (v_form->>'unitId')::uuid,
      (v_form->>'unitQuantity')::numeric, (v_form->>'baseQuantity')::numeric,
      v_base, auth.uid()
    )
    on conflict (company_id, product_id, unit_id) do update
    set unit_quantity = excluded.unit_quantity,
        base_quantity = excluded.base_quantity,
        base_unit_id = excluded.base_unit_id
    where (
      product_purchase_forms.unit_quantity,
      product_purchase_forms.base_quantity,
      product_purchase_forms.base_unit_id
    ) is distinct from (
      excluded.unit_quantity,
      excluded.base_quantity,
      excluded.base_unit_id
    );
  end loop;

  delete from public.product_purchase_forms form
  where form.company_id = p_company_id
    and form.product_id = p_product_id
    and not (form.unit_id = any(v_seen));

  return jsonb_build_object('forms', cardinality(v_seen));
end;
$$;

revoke all on function public.rpc_sync_product_purchase_forms(uuid, uuid, jsonb)
from public, anon;
grant execute on function public.rpc_sync_product_purchase_forms(uuid, uuid, jsonb)
to authenticated;

-- Igual à 0101; só o alvo do `on conflict` acompanha o índice novo, e a
-- sugestão (sempre na base) soma com a linha da forma padrão.
create or replace function public.rpc_accept_purchase_suggestion(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_suggested_quantity numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_list_id uuid;
  v_item_id uuid;
  v_event_id uuid;
  v_purchase_unit_id uuid;
  v_valid_until date;
begin
  if not (
    coalesce(private.has_permission(p_company_id, 'product.update'), false)
    or coalesce(
      private.has_permission(p_company_id, 'purchase_round.create'), false
    )
    or coalesce(private.has_permission(p_company_id, 'order.create'), false)
  ) then
    raise exception 'Sem permissao para alterar a lista de compras';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select product.purchase_unit_id
  into v_purchase_unit_id
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
    and product.is_active;

  if v_purchase_unit_id is null then
    raise exception 'Produto nao encontrado ou desativado';
  end if;

  select coalesce(nullif(company.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies company
  where company.id = p_company_id;

  v_valid_until :=
    date_trunc('week', now() at time zone v_timezone)::date + 6;

  insert into public.purchase_suggestion_events (
    company_id, product_id, action, suggested_quantity,
    chosen_quantity, valid_until, created_by
  ) values (
    p_company_id, p_product_id, 'accepted', p_suggested_quantity,
    p_quantity, v_valid_until, auth.uid()
  )
  on conflict (company_id, product_id, action, valid_until) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select list_item.id into v_item_id
    from public.shopping_list_items list_item
    join public.shopping_lists list
      on list.company_id = list_item.company_id
     and list.id = list_item.shopping_list_id
    where list_item.company_id = p_company_id
      and list_item.product_id = p_product_id
      and list_item.purchase_form_id is null
      and list_item.status = 'pending'
      and list.status = 'open'
    limit 1;
    return v_item_id;
  end if;

  select list.id into v_list_id
  from public.shopping_lists list
  where list.company_id = p_company_id and list.status = 'open'
  for update;

  if v_list_id is null then
    begin
      insert into public.shopping_lists (company_id, name, created_by)
      values (p_company_id, 'Lista atual', auth.uid())
      returning id into v_list_id;
    exception when unique_violation then
      select list.id into v_list_id
      from public.shopping_lists list
      where list.company_id = p_company_id and list.status = 'open';
    end;
  end if;

  insert into public.shopping_list_items (
    company_id, shopping_list_id, product_id, requested_quantity,
    purchase_unit_id, notes, origin, added_by
  ) values (
    p_company_id, v_list_id, p_product_id, p_quantity,
    v_purchase_unit_id, 'Sugestao baseada no historico de compras',
    'assistant', auth.uid()
  )
  on conflict (
    shopping_list_id,
    product_id,
    coalesce(purchase_form_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status = 'pending'
  do update set
    requested_quantity =
      public.shopping_list_items.requested_quantity
      + excluded.requested_quantity,
    updated_at = now()
  returning id into v_item_id;

  return v_item_id;
end;
$$;


revoke all on function public.rpc_accept_purchase_suggestion(
  uuid, uuid, numeric, numeric
) from public, anon;
grant execute on function public.rpc_accept_purchase_suggestion(
  uuid, uuid, numeric, numeric
) to authenticated;

-- ------------------------------------------------- lista para a rodada

-- Igual à 0042, mas a forma atravessa: "2 cx" da lista vira "2 cx" na
-- rodada, e só soma com um item da rodada que esteja na mesma forma.
create or replace function public.rpc_import_shopping_items_to_round(
  p_company_id uuid,
  p_round_id uuid,
  p_group_id uuid,
  p_shopping_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_group_id uuid;
  v_quotation_item_id uuid;
  v_count integer := 0;
begin
  perform private.require_permission(p_company_id, 'purchase_round.update');

  if not exists (
    select 1 from public.purchase_rounds pr
    where pr.id = p_round_id and pr.company_id = p_company_id
      and pr.status = 'draft'
  ) then
    raise exception 'Rodada inválida ou fora de preparação';
  end if;

  select g.id into v_group_id
  from public.purchase_round_groups g
  where g.company_id = p_company_id
    and g.purchase_round_id = p_round_id
    and (p_group_id is null or g.id = p_group_id)
  order by g.sort_order, g.created_at
  limit 1;

  if v_group_id is null then
    raise exception 'Grupo inválido para esta rodada';
  end if;

  for v_row in
    select sli.id, sli.product_id, sli.requested_quantity, sli.notes,
           sli.purchase_form_id,
           p.purchase_unit_id, p.pricing_unit_id, p.comparison_unit_id
    from public.shopping_list_items sli
    join public.shopping_lists sl
      on sl.id = sli.shopping_list_id and sl.company_id = sli.company_id
    join public.products p
      on p.id = sli.product_id and p.company_id = sli.company_id
    where sli.company_id = p_company_id
      and sli.id = any(p_shopping_item_ids)
      and sli.status = 'pending' and sl.status = 'open' and p.is_active
    order by sli.created_at
  loop
    v_quotation_item_id := null;

    select qi.id into v_quotation_item_id
    from public.quotation_items qi
    where qi.company_id = p_company_id
      and qi.purchase_round_id = p_round_id
      and qi.product_id = v_row.product_id
      and qi.purchase_form_id is not distinct from v_row.purchase_form_id
      and qi.commercial_status = 'open'
    order by qi.created_at
    limit 1;

    if v_quotation_item_id is null then
      -- Com forma, o gatilho troca as unidades pelas da forma.
      insert into public.quotation_items (
        company_id, purchase_round_id, group_id, product_id,
        requested_quantity, purchase_unit_id, pricing_unit_id,
        comparison_unit_id, purchase_form_id, notes
      ) values (
        p_company_id, p_round_id, v_group_id, v_row.product_id,
        v_row.requested_quantity, v_row.purchase_unit_id,
        v_row.pricing_unit_id, v_row.comparison_unit_id,
        v_row.purchase_form_id, v_row.notes
      ) returning id into v_quotation_item_id;

      insert into public.supplier_quotation_items (
        company_id, round_supplier_id, quotation_item_id,
        added_after_initial_send
      )
      select p_company_id, rsg.round_supplier_id, v_quotation_item_id,
             (rs.first_sent_at is not null)
      from public.round_supplier_groups rsg
      join public.round_suppliers rs
        on rs.id = rsg.round_supplier_id and rs.company_id = rsg.company_id
      where rsg.company_id = p_company_id
        and rsg.group_id = v_group_id and rsg.removed_at is null
      on conflict (round_supplier_id, quotation_item_id) do nothing;
    else
      update public.quotation_items
      set requested_quantity = requested_quantity + v_row.requested_quantity
      where id = v_quotation_item_id and company_id = p_company_id;
    end if;

    update public.shopping_list_items
    set status = 'imported', imported_to_type = 'quotation',
        imported_to_id = p_round_id, imported_at = now()
    where id = v_row.id and company_id = p_company_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.rpc_import_shopping_items_to_round(uuid, uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.rpc_import_shopping_items_to_round(uuid, uuid, uuid, uuid[])
  to authenticated;

-- Pedido direto ainda não conhece as formas (etapa 3). Melhor recusar com o
-- motivo do que gravar "2" na unidade padrão quando a lista dizia "2 cx".
create or replace function public.rpc_create_direct_order_from_shopping_list(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_shopping_item_ids uuid[],
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  if exists (
    select 1 from public.shopping_list_items sli
    where sli.company_id = p_company_id
      and sli.id = any(p_shopping_item_ids)
      and sli.status = 'pending'
      and sli.purchase_form_id is not null
  ) then
    raise exception 'Itens em outra forma de compra (caixa, display…) por enquanto seguem só por rodada. Tire-os da seleção para fazer o pedido direto.';
  end if;

  v_result := public.rpc_create_direct_order(
    p_company_id, p_supplier_id, p_items, p_delivery_due_date
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  update public.shopping_list_items sli
  set status = 'imported', imported_to_type = 'order',
      imported_to_id = v_order_id, imported_at = now()
  where sli.company_id = p_company_id
    and sli.id = any(p_shopping_item_ids)
    and sli.status = 'pending'
    and exists (
      select 1 from jsonb_array_elements(p_items) item
      where (item ->> 'product_id')::uuid = sli.product_id
    );

  return v_result;
end;
$$;

revoke all on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  from public, anon;
grant execute on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  to authenticated;

-- ------------------------------------------------------ link do fornecedor
-- Igual à 0118, sem exigir o fator de embalagem de item com forma de compra.
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

  return public.rpc_public_submit_quotation(p_token, p_items);
end;
$$;


revoke all on function public.rpc_public_submit_quotation_validated(text,jsonb)
  from public;
grant execute on function public.rpc_public_submit_quotation_validated(text,jsonb)
  to anon, authenticated;


-- Igual à 0111, com a equivalência da forma em cada item.
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
              'base_quantity', qi.form_base_quantity
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

commit;
