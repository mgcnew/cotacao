-- 0073_supplier_schedule_multiple_weekdays.sql
-- Uma mesma rotina pode ter mais de um dia de pedido na semana.

begin;

alter table public.supplier_purchase_schedules
  add column weekdays smallint[] not null default array[]::smallint[];

-- Todo cadastro existente mantém exatamente o dia que já possuía.
update public.supplier_purchase_schedules
set weekdays = array[weekday]::smallint[];

alter table public.supplier_purchase_schedules
  alter column weekdays set default array[1]::smallint[],
  add constraint supplier_purchase_schedules_weekdays_check
    check (
      cardinality(weekdays) between 1 and 7
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    );

comment on column public.supplier_purchase_schedules.weekdays is
  'Dias da semana aceitos para pedido: 0 domingo até 6 sábado.';

commit;
