-- 0018_revoke_anon_internal_rpcs.sql
--
--
-- PROBLEMA
-- As migrations 0013 e 0017 usam `revoke all on function ... from public`,
-- mas `PUBLIC` é o pseudo-papel: revogar dele não remove o EXECUTE concedido
-- diretamente ao papel `anon` pelo ALTER DEFAULT PRIVILEGES do Supabase.
-- Resultado: 11 RPCs internas ficaram chamáveis sem autenticação.
--
-- IMPACTO
-- Nenhum dado exposto hoje: todas chamam private.require_permission(), que
-- rejeita auth.uid() nulo com errcode 42501. O risco é de erosão — a barreira
-- passa a depender de toda RPC futura lembrar dessa checagem, em vez de o
-- próprio GRANT ser a primeira defesa.
--
-- ESCOPO
-- Só remove EXECUTE de `anon`. Não altera lógica, tabela, policy ou o
-- comportamento de usuários autenticados.
--
-- NÃO INCLUI as 5 RPCs públicas (rpc_public_*): elas devem continuar
-- acessíveis a `anon`, pois é assim que o fornecedor sem login responde
-- cotação e confirma pedido.

begin;

revoke execute on function public.rpc_record_negotiation(uuid,uuid,numeric,text,text) from anon;
revoke execute on function public.rpc_confirm_allocations_generate_orders(uuid,uuid,uuid[],date) from anon;
revoke execute on function public.rpc_create_direct_order(uuid,uuid,date,jsonb) from anon;
revoke execute on function public.rpc_create_order_revision(uuid,uuid,date,jsonb) from anon;
revoke execute on function public.rpc_mark_order_revision_sent(uuid,uuid) from anon;
revoke execute on function public.rpc_post_receipt(uuid,uuid,timestamptz,jsonb,text) from anon;
revoke execute on function public.rpc_close_order_balance(uuid,uuid,text) from anon;
revoke execute on function public.rpc_correct_quotation_response_item(uuid,uuid,numeric,boolean,boolean,text,text) from anon;
revoke execute on function public.rpc_mark_round_supplier_sent(uuid,uuid) from anon;
revoke execute on function public.rpc_resolve_order_divergence(uuid,uuid,text,text) from anon;
revoke execute on function public.rpc_resolve_commercial_divergence(uuid,uuid,text,text) from anon;

commit;
