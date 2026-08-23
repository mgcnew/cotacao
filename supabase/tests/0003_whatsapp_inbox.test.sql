-- tests/0003_whatsapp_inbox.test.sql

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_table('public', 'whatsapp_connections', 'conexões do WhatsApp');
select has_table('public', 'whatsapp_conversations', 'conversas do WhatsApp');
select has_table('public', 'whatsapp_messages', 'mensagens do WhatsApp');
select has_table('public', 'whatsapp_webhook_events', 'eventos idempotentes do webhook');

select policies_are(
  'public', 'whatsapp_connections',
  array['whatsapp_connections_insert_manage', 'whatsapp_connections_select_member', 'whatsapp_connections_update_manage'],
  'conexões possuem isolamento e gestão administrativa'
);
select policies_are(
  'public', 'whatsapp_conversations',
  array['whatsapp_conversations_insert_send', 'whatsapp_conversations_select_member', 'whatsapp_conversations_update_send'],
  'conversas possuem isolamento e permissão de envio'
);
select policies_are(
  'public', 'whatsapp_messages',
  array['whatsapp_messages_insert_send', 'whatsapp_messages_select_member', 'whatsapp_messages_update_send'],
  'mensagens possuem isolamento e permissão de envio'
);
select policies_are(
  'public', 'whatsapp_webhook_events',
  array[]::text[],
  'eventos brutos não são expostos a usuários autenticados'
);

select * from finish();

rollback;
