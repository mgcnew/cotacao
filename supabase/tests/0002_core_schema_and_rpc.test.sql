-- tests/0002_core_schema_and_rpc.test.sql
-- Smoke tests estruturais para o núcleo completo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

-- Tabelas principais
select has_table('public','suppliers','suppliers');
select has_table('public','purchase_rounds','purchase_rounds');
select has_table('public','round_supplier_groups','round_supplier_groups');
select has_table('public','quotation_responses','quotation_responses');
select has_table('public','negotiations','negotiations');
select has_table('public','purchase_allocations','purchase_allocations');
select has_table('public','purchase_round_report_snapshots','purchase_round_report_snapshots');
select has_table('public','orders','orders');
select has_table('public','order_revisions','order_revisions');
select has_table('public','order_revision_items','order_revision_items');
select has_table('public','receipts','receipts');
select has_table('public','receipt_items','receipt_items');
select has_table('public','commercial_divergences','commercial_divergences');
select has_table('public','public_access_tokens','public_access_tokens');
select has_table('public','communication_logs','communication_logs');
select has_table('public','domain_events','domain_events');
select has_table('public','audit_logs','audit_logs');

-- Views
select has_view('public','v_current_response_prices','view preço atual');
select has_view('public','v_purchase_round_progress','view progresso rodada');
select has_view('public','v_order_delivery_status','view atraso pedido');
select has_view('public','v_conversion_history','view conversões');
select has_view('public','v_realized_savings','view economia realizada');
select has_view('public','v_supplier_product_stats','view fornecedor x produto');
select has_view('public','v_quotation_history','view histórico de cotações');

-- RPCs internas
select has_function('public','rpc_record_negotiation',
  array['uuid','uuid','numeric','text','text'],
  'rpc_record_negotiation');
select has_function('public','rpc_confirm_allocations_generate_orders',
  array['uuid','uuid','uuid[]','date'],
  'rpc_confirm_allocations_generate_orders');
select has_function('public','rpc_create_direct_order',
  array['uuid','uuid','date','jsonb'],
  'rpc_create_direct_order');
select has_function('public','rpc_create_order_revision',
  array['uuid','uuid','date','jsonb'],
  'rpc_create_order_revision');
select has_function('public','rpc_post_receipt',
  array['uuid','uuid','timestamp with time zone','jsonb','text'],
  'rpc_post_receipt');
select has_function('public','rpc_upsert_round_supplier_groups',
  array['uuid','uuid','uuid','uuid','uuid[]'],
  'rpc_upsert_round_supplier_groups');
select has_function('public','rpc_remove_round_supplier',
  array['uuid','uuid','text'],
  'rpc_remove_round_supplier');
select has_function('private','retire_closed_round_supplier_groups',
  array[]::text[],
  'retire_closed_round_supplier_groups');
select has_function('public','rpc_quotation_history_summary',
  array['uuid','uuid','uuid','date','date'],
  'rpc_quotation_history_summary');
select has_function('public','rpc_get_purchase_round_report',
  array['uuid','uuid'],
  'rpc_get_purchase_round_report');

-- RPCs públicas
select has_function('public','rpc_public_get_quotation',
  array['text'],
  'rpc_public_get_quotation');
select has_function('public','rpc_public_submit_quotation',
  array['text','jsonb'],
  'rpc_public_submit_quotation');
select has_function('public','rpc_public_get_order',
  array['text'],
  'rpc_public_get_order');
select has_function('public','rpc_public_confirm_order',
  array['text'],
  'rpc_public_confirm_order');
select has_function('public','rpc_public_report_order_divergence',
  array['text','jsonb'],
  'rpc_public_report_order_divergence');

select * from finish();

rollback;
