-- Separa conversas operacionais de contatos que enviam promoções frequentes.
-- As mensagens continuam preservadas, mas não poluem a fila de trabalho.

begin;

alter table public.whatsapp_conversations
  add column if not exists inbox_category text not null default 'operational'
    check (inbox_category in ('operational', 'promotion')),
  add column if not exists categorized_at timestamptz;

create index if not exists whatsapp_conversations_promotions_idx
on public.whatsapp_conversations(company_id, last_message_at desc nulls last)
where inbox_category = 'promotion';

commit;
