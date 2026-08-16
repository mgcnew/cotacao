-- 0028_overdue_includes_awaiting_confirmation.sql
--
-- APLICADA em 2026-08-16.
--
-- PROBLEMA
-- `v_order_delivery_status` (0015) considera atrasado apenas o pedido em
-- 'awaiting_delivery' ou 'partially_received'. Fica de fora o pedido que foi
-- enviado, o fornecedor nunca confirmou, e o prazo combinado ja passou --
-- 'awaiting_confirmation' com `delivery_due_date < current_date`.
--
-- Esse e justamente um caso que precisa de atencao: mercadoria prometida para
-- ontem, e do outro lado ninguem respondeu. A definicao antiga chamava isso de
-- "em dia" so porque o fornecedor nao confirmou.
--
-- A secao 16.10 do documento mestre define atraso como "data atual superar a
-- previsao e houver saldo pendente". Pedido aguardando confirmacao tem saldo
-- pendente inteiro -- nada dele foi recebido.
--
-- IMPACTO
-- A lista de Pedidos ja contava as tres situacoes como atraso; a view contava
-- duas. Dois numeros diferentes para a mesma pergunta, dependendo da tela.
-- Esta migration escolhe a definicao mais ampla, e a lista de Pedidos passa a
-- ler o atraso DESTA view em vez de recalcular por conta propria -- uma
-- definicao so, no banco, como o resto dos numeros do sistema.
--
-- SOLUCAO
-- Acrescenta 'awaiting_confirmation' aos dois CASE. Nada mais muda: mesmas
-- colunas, mesma ordem, mesmo security_invoker. `create or replace view`
-- exige exatamente isso.
--
-- Quem mais le a view: `listOrdersWithDelivery`, usada na Central da Rodada.
-- O efeito la e o desejado -- pedido enviado e vencido passa a aparecer como
-- atrasado tambem naquela tela.
--
-- VERIFICADO apos aplicar: a view devolve is_overdue verdadeiro para pedido
-- em awaiting_confirmation com prazo vencido, e segue falsa para pedido
-- recebido, cancelado ou sem prazo definido.

begin;

create or replace view public.v_order_delivery_status
with (security_invoker = true)
as
select
  o.company_id,
  o.id as order_id,
  o.order_number,
  o.supplier_id,
  o.status,
  r.id as current_revision_id,
  r.delivery_due_date,
  case
    when o.status in (
      'awaiting_confirmation','awaiting_delivery','partially_received'
    )
     and r.delivery_due_date is not null
     and r.delivery_due_date < current_date
    then true
    else false
  end as is_overdue,
  case
    when o.status in (
      'awaiting_confirmation','awaiting_delivery','partially_received'
    )
     and r.delivery_due_date is not null
     and r.delivery_due_date < current_date
    then current_date - r.delivery_due_date
    else 0
  end as overdue_days
from public.orders o
left join public.order_revisions r
  on r.id = o.current_revision_id
 and r.company_id = o.company_id;

grant select on public.v_order_delivery_status to authenticated;

commit;
