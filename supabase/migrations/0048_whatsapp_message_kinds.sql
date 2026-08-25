-- 0048_whatsapp_message_kinds.sql
--
-- Classifica comunicações operacionais e preserva o texto efetivamente
-- enviado. A classificação permite proteger cobranças contra duplicidade e
-- mostrar a última cobrança sem confundi-la com o convite inicial.

begin;

alter table public.communication_logs
  add column if not exists message_kind text not null default 'other'
    check (message_kind in (
      'quotation_invitation',
      'quotation_reminder',
      'order_confirmation',
      'delivery_notice',
      'divergence',
      'general',
      'other'
    )),
  add column if not exists message_body text
    check (message_body is null or char_length(message_body) <= 10000);

create index if not exists communication_logs_round_kind_created_idx
on public.communication_logs(company_id, round_supplier_id, message_kind, created_at desc)
where round_supplier_id is not null;

commit;
