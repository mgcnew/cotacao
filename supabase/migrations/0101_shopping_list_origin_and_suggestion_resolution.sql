-- Separa a origem dos itens da lista e encerra uma sugestao quando uma NF-e
-- historica comprova que a compra ocorreu na data prevista ou depois dela.

begin;

alter table public.shopping_list_items
add column origin text not null default 'manual'
check (origin in ('manual', 'assistant'));

-- Antes desta coluna, a unica pista persistida era a observacao criada pela
-- propria RPC da assistente.
update public.shopping_list_items
set origin = 'assistant'
where notes in (
  'Sugestao baseada no historico de recebimentos',
  'Sugestao baseada no historico de compras'
);

create index shopping_list_items_company_origin_status_idx
on public.shopping_list_items(company_id, origin, status, created_at desc);

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
  on conflict (shopping_list_id, product_id) where status = 'pending'
  do update set
    requested_quantity =
      public.shopping_list_items.requested_quantity
      + excluded.requested_quantity,
    updated_at = now()
  returning id into v_item_id;

  return v_item_id;
end;
$$;

create or replace function public.rpc_post_historical_nfe_import_with_rules(
  p_company_id uuid,
  p_import_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_unit_rules jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_pricing_unit_id uuid;
  v_xml_unit text;
  v_commercial_unit text;
  v_tributary_unit text;
  v_mode text;
  v_factor numeric;
  v_timezone text;
  v_issued_date date;
  v_valid_until date;
  v_resolved_products uuid[] := array[]::uuid[];
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if jsonb_typeof(p_unit_rules) <> 'array' then
    raise exception 'Conversões da NF-e inválidas';
  end if;

  select
    coalesce(nullif(company.timezone, ''), 'America/Sao_Paulo'),
    (history.issued_at at time zone coalesce(
      nullif(company.timezone, ''), 'America/Sao_Paulo'
    ))::date
  into v_timezone, v_issued_date
  from public.historical_nfe_imports history
  join public.companies company on company.id = history.company_id
  where history.company_id = p_company_id
    and history.id = p_import_id
    and history.status = 'draft';

  if v_issued_date is null then
    raise exception 'Importação não encontrada ou já concluída';
  end if;

  -- O cálculo acontece antes da postagem: assim comparamos a emissão da NF-e
  -- com a data da sugestão que estava visível, sem a nova compra deslocar a
  -- próxima previsão para outro ciclo.
  select coalesce(array_agg(baseline.product_id), array[]::uuid[])
  into v_resolved_products
  from public.rpc_get_purchase_demand_baselines(
    p_company_id, 52, 250
  ) baseline
  where v_issued_date >= baseline.next_expected_date
    and exists (
      select 1
      from jsonb_array_elements(p_items) entry
      where not coalesce((entry.value ->> 'ignored')::boolean, false)
        and nullif(entry.value ->> 'product_id', '')::uuid
          = baseline.product_id
    );

  perform public.rpc_post_historical_nfe_import(
    p_company_id,
    p_import_id,
    p_supplier_id,
    p_items
  );

  for v_rule in select value from jsonb_array_elements(p_unit_rules)
  loop
    v_item_id := nullif(v_rule ->> 'item_id', '')::uuid;
    v_xml_unit := pg_catalog.upper(
      nullif(pg_catalog.btrim(v_rule ->> 'xml_unit'), '')
    );
    v_mode := v_rule ->> 'mode';
    v_factor := nullif(v_rule ->> 'factor', '')::numeric;

    if v_item_id is null or v_xml_unit is null
       or char_length(v_xml_unit) > 30 then
      raise exception 'Há conversão sem item ou unidade de origem';
    end if;
    if v_mode not in ('fixed_factor', 'manual_quantity') then
      raise exception 'Tipo de conversão inválido';
    end if;
    if (v_mode = 'fixed_factor' and (v_factor is null or v_factor <= 0))
       or (v_mode = 'manual_quantity' and v_factor is not null) then
      raise exception 'Fator de conversão inválido';
    end if;

    select
      item.product_id,
      product.pricing_unit_id,
      item.commercial_unit,
      item.tributary_unit
    into
      v_product_id,
      v_pricing_unit_id,
      v_commercial_unit,
      v_tributary_unit
    from public.historical_nfe_items item
    join public.products product
      on product.company_id = item.company_id
     and product.id = item.product_id
    where item.company_id = p_company_id
      and item.import_id = p_import_id
      and item.id = v_item_id
      and item.reconciliation_status = 'matched';

    if v_product_id is null or v_pricing_unit_id is null then
      raise exception 'Conversão não corresponde a um item conciliado';
    end if;
    if not (
      v_xml_unit = coalesce(
        pg_catalog.upper(nullif(pg_catalog.btrim(v_commercial_unit), '')), ''
      )
      or v_xml_unit = coalesce(
        pg_catalog.upper(nullif(pg_catalog.btrim(v_tributary_unit), '')), ''
      )
    ) then
      raise exception 'Unidade da conversão não existe no item da NF-e';
    end if;

    insert into public.supplier_product_nfe_unit_rules (
      company_id,
      supplier_id,
      product_id,
      xml_unit,
      target_unit_id,
      mode,
      factor,
      source,
      created_by,
      last_used_at
    )
    values (
      p_company_id,
      p_supplier_id,
      v_product_id,
      v_xml_unit,
      v_pricing_unit_id,
      v_mode,
      case when v_mode = 'fixed_factor' then v_factor else null end,
      'nfe',
      auth.uid(),
      now()
    )
    on conflict (
      company_id,
      supplier_id,
      product_id,
      xml_unit,
      target_unit_id
    )
    do update set
      mode = excluded.mode,
      factor = excluded.factor,
      source = 'nfe',
      last_used_at = now(),
      updated_at = now();
  end loop;

  v_valid_until :=
    date_trunc('week', now() at time zone v_timezone)::date + 6;

  insert into public.purchase_suggestion_events (
    company_id,
    product_id,
    action,
    suggested_quantity,
    chosen_quantity,
    valid_until,
    created_by
  )
  select
    p_company_id,
    resolved.product_id,
    'dismissed',
    null,
    null,
    v_valid_until,
    auth.uid()
  from unnest(v_resolved_products) resolved(product_id)
  on conflict (company_id, product_id, action, valid_until) do nothing;
end;
$$;

revoke all on function public.rpc_accept_purchase_suggestion(
  uuid, uuid, numeric, numeric
) from public, anon;
grant execute on function public.rpc_accept_purchase_suggestion(
  uuid, uuid, numeric, numeric
) to authenticated;

revoke all on function public.rpc_post_historical_nfe_import_with_rules(
  uuid, uuid, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.rpc_post_historical_nfe_import_with_rules(
  uuid, uuid, uuid, jsonb, jsonb
) to authenticated;

commit;
