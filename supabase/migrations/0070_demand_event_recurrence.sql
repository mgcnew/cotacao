-- 0070_demand_event_recurrence.sql
-- Permite reutilizar eventos de demanda recorrentes sem duplicar cadastros.

begin;

alter table public.demand_calendar_events
  add column recurrence text not null default 'one_time'
    check (recurrence in ('one_time', 'weekly', 'monthly', 'yearly')),
  add column recurrence_until date,
  add constraint demand_calendar_events_recurrence_until_check
    check (recurrence_until is null or recurrence_until >= start_date);

comment on column public.demand_calendar_events.recurrence is
  'Frequencia da repeticao. O intervalo entre start_date e end_date define a duracao de cada ocorrencia.';

comment on column public.demand_calendar_events.recurrence_until is
  'Ultima data permitida para o inicio de uma ocorrencia recorrente.';

create index demand_calendar_events_recurrence_idx
on public.demand_calendar_events(company_id, recurrence, start_date, recurrence_until)
where is_active;

commit;
