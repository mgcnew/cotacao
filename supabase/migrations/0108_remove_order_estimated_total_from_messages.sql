-- O valor de um pedido pode depender do peso efetivamente entregue.
-- Remove {total} dos modelos personalizados antigos para não apresentar como
-- fechado um valor que só será conhecido no recebimento.

begin;

update public.whatsapp_message_templates
set body = trim(
  both E'\n'
  from regexp_replace(
    body,
    E'(^|\\n)[^\\n]*\\{total\\}[^\\n]*(\\n|$)',
    E'\\1',
    'g'
  )
)
where kind = 'order_confirmation'
  and body like '%{total}%';

commit;
