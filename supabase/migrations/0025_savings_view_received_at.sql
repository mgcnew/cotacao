-- 0025_savings_view_received_at.sql
--
-- APLICADA em 2026-08-14.
--
-- PROBLEMA
-- Os filtros globais da Central de Analises pedem periodo (documento 14),
-- mas `v_realized_savings` nao expunha data nenhuma. Sem data, "economia dos
-- ultimos 3 meses" e impossivel de responder.
--
-- Filtrar por order_id daria resultado impreciso: um pedido pode ter
-- recebimentos em meses diferentes, e todos entrariam ou sairiam juntos.
--
-- SOLUCAO
-- Acrescentar `receipt_id` e `received_at` ao FIM da lista de colunas.
-- Puramente aditivo: nenhuma coluna existente muda de nome, tipo ou posicao,
-- nenhuma tabela e tocada, nenhuma policy e alterada. A view continua
-- security_invoker, entao a RLS de quem consulta segue valendo.
--
-- Categoria nao precisa entrar: product_id ja permite resolver a categoria do
-- lado da aplicacao, sem inchar a view.
--
-- VERIFICADO apos aplicar: 14 colunas, as 12 originais na mesma posicao, e o
-- grant de select para authenticated preservado.

create or replace view public.v_realized_savings
with (security_invoker = true)
as
select
  ri.company_id,
  rec.order_id,
  o.supplier_id,
  ori.id as order_revision_item_id,
  ori.product_id,
  qri.quoted_price,
  ori.agreed_price,
  ri.practiced_price,
  ri.pricing_quantity_received,
  (qri.quoted_price - ori.agreed_price)
    * ri.pricing_quantity_received as negotiated_savings,
  (qri.quoted_price - ri.practiced_price)
    * ri.pricing_quantity_received as realized_savings,
  (ri.practiced_price - ori.agreed_price)
    * ri.pricing_quantity_received as divergence_impact,
  rec.id as receipt_id,
  rec.received_at
from public.receipt_items ri
join public.receipts rec
  on rec.id = ri.receipt_id
 and rec.company_id = ri.company_id
join public.orders o
  on o.id = rec.order_id
 and o.company_id = rec.company_id
join public.order_revision_items ori
  on ori.id = ri.order_revision_item_id
 and ori.company_id = ri.company_id
join public.purchase_allocations pa
  on pa.id = ori.purchase_allocation_id
 and pa.company_id = ori.company_id
join public.quotation_response_items qri
  on qri.id = pa.quotation_response_item_id
 and qri.company_id = pa.company_id
where rec.status = 'posted';

grant select on public.v_realized_savings to authenticated;
