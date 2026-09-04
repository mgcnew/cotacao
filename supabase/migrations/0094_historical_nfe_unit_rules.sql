-- 0094_historical_nfe_unit_rules.sql
--
-- Confirma a NF-e historica e aprende, na mesma transacao, como o fornecedor
-- expressa caixas, pacotes, fardos, displays e quantidades de peso variavel.

begin;

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
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if jsonb_typeof(p_unit_rules) <> 'array' then
    raise exception 'Conversões da NF-e inválidas';
  end if;

  -- A função original continua sendo a única responsável por validar e gravar
  -- fornecedor, itens, aliases e histórico. Como a chamada é interna à mesma
  -- transação, qualquer falha nas regras também desfaz a confirmação inteira.
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
end;
$$;

revoke all on function public.rpc_post_historical_nfe_import_with_rules(
  uuid, uuid, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.rpc_post_historical_nfe_import_with_rules(
  uuid, uuid, uuid, jsonb, jsonb
) to authenticated;

commit;
