-- 0019_align_table_grants.sql
--
-- APLICADA em 2026-08-14 pelo SQL Editor do Supabase.
-- Verificado depois: authenticated com TRUNCATE em 0 de 40 tabelas.
--
-- PROBLEMA
-- Mesmo padrao da 0018, agora em tabelas. O Supabase concede ALL em objetos
-- novos do schema `public` para `anon` e `authenticated` via ALTER DEFAULT
-- PRIVILEGES. As migrations concederam os privilegios pretendidos
-- (`grant select, insert ...`), mas nunca revogaram o excesso de
-- `authenticated`. Resultado: `authenticated` tem hoje DELETE, UPDATE,
-- TRUNCATE, REFERENCES e TRIGGER em praticamente todas as tabelas -- inclusive
-- em `public_access_tokens`, que nao deveria ter grant nenhum.
--
-- IMPACTO
-- DELETE e UPDATE indevidos sao contidos pelo RLS (nao ha policy para eles,
-- entao afetam 0 linhas) -- verificado na pratica.
-- TRUNCATE **nao e filtrado por RLS**: um usuario autenticado comum consegue
-- esvaziar tabelas folha, de todas as empresas. Confirmado em teste revertido:
-- TRUNCATE em domain_events levou a contagem de 1 para 0, apagando a trilha de
-- auditoria. Nao e explotavel pela API REST (o PostgREST nao expoe TRUNCATE),
-- mas o privilegio nao deveria existir, e hoje a unica barreira do resto e o RLS.
--
-- SOLUCAO
-- Zerar os privilegios de `authenticated` e reconceder exatamente o que as
-- migrations 0004-0017 declararam. A lista abaixo foi extraida dos proprios
-- arquivos, nao escrita a mao.
-- `public_access_tokens` fica de fora de proposito: nenhuma migration lhe
-- concede grant, e o acesso e so pelas RPCs SECURITY DEFINER.
--
-- OBSERVACAO
-- Isto corrige o estado atual. Tabelas criadas no futuro voltarao a nascer com
-- ALL para authenticated, a menos que os ALTER DEFAULT PRIVILEGES do projeto
-- sejam ajustados -- decisao separada, fora do escopo desta migration.

begin;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.audit_logs to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.commercial_divergences to authenticated;
grant select on public.communication_logs to authenticated;
grant select on public.companies to authenticated;
grant select, insert, update on public.company_members to authenticated;
grant select on public.domain_events to authenticated;
grant select, insert, update, delete on public.member_permission_overrides to authenticated;
grant select, insert on public.negotiations to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.order_divergences to authenticated;
grant select, insert on public.order_revision_items to authenticated;
grant select, insert on public.order_revisions to authenticated;
grant select, insert on public.orders to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update on public.product_attribute_definitions to authenticated;
grant select, insert, update, delete on public.product_attribute_values to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.purchase_allocations to authenticated;
grant select, insert, update on public.purchase_round_groups to authenticated;
grant select, insert, update on public.purchase_rounds to authenticated;
grant select, insert, update on public.quotation_items to authenticated;
grant select, insert on public.quotation_response_attribute_values to authenticated;
grant select, insert on public.quotation_response_items to authenticated;
grant select, insert, update on public.quotation_responses to authenticated;
grant select, insert on public.receipt_items to authenticated;
grant select, insert on public.receipts to authenticated;
grant select, insert on public.response_item_corrections to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, update on public.roles to authenticated;
grant select, insert, update on public.round_suppliers to authenticated;
grant select, insert, delete on public.supplier_categories to authenticated;
grant select, insert, update on public.supplier_contacts to authenticated;
grant select, insert, update on public.supplier_products to authenticated;
grant select, insert, update, delete on public.supplier_purchase_schedules to authenticated;
grant select, insert, update on public.supplier_quotation_items to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.units to authenticated;
grant select on public.v_conversion_history to authenticated;
grant select on public.v_current_response_prices to authenticated;
grant select on public.v_order_delivery_status to authenticated;
grant select on public.v_purchase_round_progress to authenticated;
grant select on public.v_realized_savings to authenticated;
grant select on public.v_supplier_product_stats to authenticated;

commit;
