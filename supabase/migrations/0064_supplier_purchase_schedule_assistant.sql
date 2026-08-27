-- 0064_supplier_purchase_schedule_assistant.sql
-- Transforma a agenda básica do fornecedor numa rotina operacional de compra.

begin;

alter table public.supplier_purchase_schedules
  add column label text,
  add column interval_weeks smallint not null default 1,
  add column anchor_date date not null default current_date,
  add column reminder_days_before smallint not null default 1,
  add column expected_delivery_days smallint,
  add column notes text,
  add column snoozed_until date,
  add column last_dismissed_occurrence date;

alter table public.supplier_purchase_schedules
  add constraint supplier_purchase_schedules_label_length_check
    check (label is null or char_length(label) between 2 and 120),
  add constraint supplier_purchase_schedules_interval_check
    check (interval_weeks between 1 and 12),
  add constraint supplier_purchase_schedules_reminder_check
    check (reminder_days_before between 0 and 14),
  add constraint supplier_purchase_schedules_delivery_check
    check (expected_delivery_days is null or expected_delivery_days between 0 and 30),
  add constraint supplier_purchase_schedules_notes_length_check
    check (notes is null or char_length(notes) <= 500);

comment on column public.supplier_purchase_schedules.interval_weeks is
  'Periodicidade em semanas: 1 semanal, 2 quinzenal, 4 a cada quatro semanas.';
comment on column public.supplier_purchase_schedules.anchor_date is
  'Data-base usada para manter a paridade de agendas com mais de uma semana.';
comment on column public.supplier_purchase_schedules.last_dismissed_occurrence is
  'Ocorrência dispensada conscientemente; não desativa as próximas.';

create index supplier_purchase_schedules_active_alert_idx
on public.supplier_purchase_schedules(company_id, is_active, weekday)
where is_active = true;

commit;
