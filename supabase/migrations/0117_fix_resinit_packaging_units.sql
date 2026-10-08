-- Resinit: embalagem cadastrada no formato antigo, que a 0109 não alcançou.
--
-- Compra em bobina, precificação em metro e nenhuma unidade de comparação. O
-- comprador e o fornecedor informam o preço da bobina inteira e quantos metros
-- vêm nela — mas, com a precificação em metro, o sistema lia os R$ 150 como
-- preço do metro e somava 5 bobinas × 700 m × R$ 150 = R$ 525.000.
--
-- A 0109 corrigiu esse formato só quando a categoria tinha um fator na própria
-- unidade de precificação (metro). Em Embalagens o fator da categoria é
-- "Quantidade por pacote", em unidades, e o Resinit passou. O cadastro também
-- deixava criá-lo assim; isso é fechado no código junto com esta migration.
--
-- A forma certa, a mesma das outras embalagens:
--   compra/precificação = bobina
--   comparação = metro, com o fator próprio "Metros por bobina"
--
-- Os números já lançados não mudam: R$ 150 e R$ 188 sempre foram o preço da
-- bobina, e 700 e 800 sempre foram os metros dela. Só passam a ser lidos como
-- tal. Os fatores estavam gravados no fator da categoria, em unidades; são
-- movidos (e não copiados) para o fator novo, porque a comparação usa um fator
-- por resposta e dois na mesma resposta seriam ambíguos.

begin;

do $$
declare
  v_product record;
  v_definition_id uuid;
begin
  select product.id, product.company_id, product.category_id,
         product.purchase_unit_id, product.pricing_unit_id
  into v_product
  from public.products product
  join public.units purchase_unit
    on purchase_unit.company_id = product.company_id
   and purchase_unit.id = product.purchase_unit_id
  join public.units pricing_unit
    on pricing_unit.company_id = product.company_id
   and pricing_unit.id = product.pricing_unit_id
  where product.id = 'b8267d58-b5bf-4c78-9175-1c6d99da63ce'
    and product.purpose = 'packaging'
    and product.comparison_unit_id is null
    and purchase_unit.symbol = 'Bo'
    and pricing_unit.symbol = 'metro';

  -- Já corrigido (ou em outro banco): nada a fazer.
  if v_product.id is null then
    return;
  end if;

  -- 1. O fator próprio do produto, como o cadastro cria para embalagens.
  select definition.id into v_definition_id
  from public.product_attribute_definitions definition
  where definition.company_id = v_product.company_id
    and definition.product_id = v_product.id
    and definition.is_conversion_factor = true;

  if v_definition_id is null then
    insert into public.product_attribute_definitions (
      company_id, product_id, name, key, data_type, unit_id,
      is_required, is_active, is_conversion_factor
    ) values (
      v_product.company_id, v_product.id, 'Metros por bobina',
      'metros_por_bobina', 'numeric', v_product.pricing_unit_id,
      true, true, true
    ) returning id into v_definition_id;
  else
    update public.product_attribute_definitions
    set name = 'Metros por bobina',
        unit_id = v_product.pricing_unit_id,
        is_required = true,
        is_active = true,
        updated_at = now()
    where id = v_definition_id;
  end if;

  -- 2. Os metros já informados nas respostas passam para o fator novo.
  update public.quotation_response_attribute_values value
  set attribute_definition_id = v_definition_id
  from public.quotation_response_items response_item,
       public.supplier_quotation_items supplier_item,
       public.quotation_items item,
       public.product_attribute_definitions old_definition
  where value.company_id = v_product.company_id
    and response_item.company_id = value.company_id
    and response_item.id = value.quotation_response_item_id
    and supplier_item.company_id = response_item.company_id
    and supplier_item.id = response_item.supplier_quotation_item_id
    and item.company_id = supplier_item.company_id
    and item.id = supplier_item.quotation_item_id
    and item.product_id = v_product.id
    and old_definition.company_id = value.company_id
    and old_definition.id = value.attribute_definition_id
    and old_definition.is_conversion_factor = true
    and old_definition.id <> v_definition_id
    and not exists (
      select 1
      from public.quotation_response_attribute_values already
      where already.quotation_response_item_id = value.quotation_response_item_id
        and already.attribute_definition_id = v_definition_id
    );

  -- O mesmo para o valor guardado no próprio cadastro, se houver.
  update public.product_attribute_values value
  set attribute_definition_id = v_definition_id
  from public.product_attribute_definitions old_definition
  where value.company_id = v_product.company_id
    and value.product_id = v_product.id
    and old_definition.company_id = value.company_id
    and old_definition.id = value.attribute_definition_id
    and old_definition.is_conversion_factor = true
    and old_definition.id <> v_definition_id
    and not exists (
      select 1
      from public.product_attribute_values already
      where already.company_id = value.company_id
        and already.product_id = value.product_id
        and already.attribute_definition_id = v_definition_id
    );

  -- 3. Rodadas ainda editáveis: a foto das unidades no item da cotação.
  update public.quotation_items item
  set comparison_unit_id = item.pricing_unit_id,
      pricing_unit_id = item.purchase_unit_id,
      updated_at = now()
  from public.purchase_rounds round
  where item.company_id = v_product.company_id
    and item.product_id = v_product.id
    and item.purchase_unit_id <> item.pricing_unit_id
    and item.comparison_unit_id is null
    and round.company_id = item.company_id
    and round.id = item.purchase_round_id
    and round.status in ('draft', 'active');

  -- Decisões em rascunho recalculam a quantidade precificada e o custo pelos
  -- gatilhos, como na 0109.
  update public.purchase_allocations allocation
  set allocated_quantity = allocation.allocated_quantity
  from public.quotation_items item
  where allocation.company_id = item.company_id
    and allocation.quotation_item_id = item.id
    and item.product_id = v_product.id
    and allocation.status = 'draft';

  -- 4. O cadastro, para as próximas rodadas.
  update public.products
  set comparison_unit_id = pricing_unit_id,
      pricing_unit_id = purchase_unit_id,
      updated_at = now()
  where id = v_product.id;
end;
$$;

commit;
