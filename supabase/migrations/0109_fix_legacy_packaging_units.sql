-- Embalagens legadas foram cadastradas como compra em pacote, precificação na
-- unidade interna e sem unidade de comparação. O fornecedor, porém, informa o
-- preço do pacote inteiro e a quantidade contida nele. Nessa configuração o
-- total acabava sendo pacote × conteúdo × preço do pacote.
--
-- A forma correta é:
--   compra/precificação = pacote
--   comparação = unidade interna

begin;

-- Corrige os snapshots de rodadas ainda editáveis antes do cadastro vivo. A
-- unidade antiga de precificação é preservada como unidade de comparação.
update public.quotation_items item
set comparison_unit_id = item.pricing_unit_id,
    pricing_unit_id = item.purchase_unit_id,
    updated_at = now()
from public.products product,
     public.purchase_rounds round
where product.company_id = item.company_id
  and product.id = item.product_id
  and product.purpose = 'packaging'
  and round.company_id = item.company_id
  and round.id = item.purchase_round_id
  and round.status in ('draft', 'active')
  and item.purchase_unit_id <> item.pricing_unit_id
  and item.comparison_unit_id is null
  and exists (
    select 1
    from public.product_attribute_definitions definition
    where definition.company_id = item.company_id
      and definition.is_active = true
      and definition.is_conversion_factor = true
      and definition.unit_id = item.pricing_unit_id
      and (
        definition.product_id = product.id
        or definition.category_id = product.category_id
      )
  );

-- Recalcula somente decisões ainda em rascunho. Os triggers passam a guardar
-- a quantidade de pacotes como quantidade precificada e o custo comparável
-- como preço do pacote dividido pelo conteúdo.
update public.purchase_allocations allocation
set allocated_quantity = allocation.allocated_quantity
from public.quotation_items item,
     public.products product
where allocation.company_id = item.company_id
  and allocation.quotation_item_id = item.id
  and product.company_id = item.company_id
  and product.id = item.product_id
  and product.purpose = 'packaging'
  and allocation.status = 'draft'
  and item.purchase_unit_id = item.pricing_unit_id
  and item.comparison_unit_id is not null
  and item.comparison_unit_id <> item.pricing_unit_id;

-- Evita que as próximas rodadas repitam a configuração antiga.
update public.products product
set comparison_unit_id = product.pricing_unit_id,
    pricing_unit_id = product.purchase_unit_id,
    updated_at = now()
where product.purpose = 'packaging'
  and product.purchase_unit_id <> product.pricing_unit_id
  and product.comparison_unit_id is null
  and exists (
    select 1
    from public.product_attribute_definitions definition
    where definition.company_id = product.company_id
      and definition.is_active = true
      and definition.is_conversion_factor = true
      and definition.unit_id = product.pricing_unit_id
      and (
        definition.product_id = product.id
        or definition.category_id = product.category_id
      )
  );

commit;
