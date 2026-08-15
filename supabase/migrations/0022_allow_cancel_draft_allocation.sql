-- 0022_allow_cancel_draft_allocation.sql
--
-- APLICADA em 2026-08-14.
--
-- PROBLEMA
-- A policy de UPDATE de purchase_allocations exigia status = 'draft' tanto no
-- USING quanto no WITH CHECK. O USING esta certo -- so rascunho pode ser
-- mexido. Mas o WITH CHECK igual impedia a propria transicao para 'cancelled',
-- que o CHECK da coluna ja prevê. Resultado: uma alocacao criada para o
-- fornecedor errado nao podia ser desfeita pelo app (verificado: UPDATE para
-- cancelled e DELETE respondem 42501).
--
-- IMPACTO
-- A linha errada seguia ate virar pedido, e o conserto passava a ser cancelar
-- um pedido que nunca deveria ter existido -- expondo o fornecedor a um pedido
-- indevido.
--
-- SOLUCAO
-- O WITH CHECK passa a aceitar 'draft' ou 'cancelled'. O USING continua so
-- 'draft', entao:
--   - draft -> draft      (editar quantidade/preco)  permitido
--   - draft -> cancelled  (desfazer a decisao)       permitido
--   - draft -> confirmed  (gerar pedido)             segue recusado
--   - cancelled -> *      (mexer no que ja acabou)   segue recusado
-- Confirmar continua exclusivo de rpc_confirm_allocations_generate_orders,
-- que e SECURITY DEFINER e nao passa por esta policy.
--
-- Cancelar em vez de apagar e deliberado: a decisao errada fica no historico,
-- como todo o resto do sistema. Nenhum grant de DELETE e concedido.
--
-- A RPC de confirmacao ja filtra por status = 'draft', entao alocacoes
-- canceladas ficam naturalmente de fora dos pedidos.
--
-- VERIFICADO apos aplicar, com JWT real e rollback:
--   draft->confirmed  BLOQUEADO 42501
--   draft->replaced   BLOQUEADO 42501
--   draft->cancelled  1 linha, status=cancelled
--   cancelled->draft  0 linhas (USING recusa)
--   RPC confirmando alocacao cancelada  BLOQUEADA

drop policy if exists purchase_allocations_update_draft
  on public.purchase_allocations;

create policy purchase_allocations_update_draft
on public.purchase_allocations
for update to authenticated
using (
  status = 'draft'
  and (select private.has_permission(company_id, 'purchase_allocation.update'))
)
with check (
  status in ('draft', 'cancelled')
  and (select private.has_permission(company_id, 'purchase_allocation.update'))
);
