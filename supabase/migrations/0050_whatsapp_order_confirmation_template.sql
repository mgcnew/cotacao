alter table public.whatsapp_message_templates
  drop constraint if exists whatsapp_message_templates_kind_check;

alter table public.whatsapp_message_templates
  add constraint whatsapp_message_templates_kind_check
  check (kind in ('quotation_invitation', 'quotation_reminder', 'order_confirmation'));
