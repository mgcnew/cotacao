-- 0021_attribute_conversion_factor.sql
--
-- APLICADA em 2026-08-14.
--
-- PROBLEMA
-- O documento mestre exige comparacao normalizada: R$ 49,00 no pacote com 400
-- e R$ 49,00 no pacote com 500 devem virar R$ 0,1225 e R$ 0,0980 por unidade.
-- Para dividir, o sistema precisa saber quantas unidades tem o pacote de CADA
-- fornecedor -- numero que chega como atributo da resposta.
--
-- Ate aqui nada no schema dizia QUAL atributo e o divisor.
-- `quotation_items.estimated_conversion_rate` nao serve: e estimativa do
-- comprador, igual para todos os fornecedores, justamente o que o exemplo
-- precisa diferenciar.
--
-- SOLUCAO
-- Marca explicita na definicao do atributo. A regra fica declarada no banco,
-- e nao dependendo de uma coincidencia entre a unidade do atributo e a
-- unidade de comparacao do item.
--
-- Duas garantias vem junto:
--  1. fator de conversao so faz sentido em atributo numerico;
--  2. no maximo um fator ativo por categoria (ou por produto), senao a divisao
--     seria ambigua e daria preco errado em silencio.

alter table public.product_attribute_definitions
  add column is_conversion_factor boolean not null default false;

comment on column public.product_attribute_definitions.is_conversion_factor is
  'Quando true, o valor numerico informado pelo fornecedor divide o preco cotado para chegar ao preco na unidade de comparacao do item.';

alter table public.product_attribute_definitions
  add constraint product_attribute_definitions_conversion_numeric_check
  check (is_conversion_factor = false or data_type = 'numeric');

create unique index product_attribute_definitions_one_conversion_uidx
  on public.product_attribute_definitions (company_id, coalesce(category_id, product_id))
  where is_conversion_factor = true and is_active = true;
