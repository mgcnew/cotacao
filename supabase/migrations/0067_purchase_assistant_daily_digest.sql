-- 0067_purchase_assistant_daily_digest.sql
-- Resumo diario persistente no sino. A geracao e exclusiva do cron do servidor
-- e cada usuario recebe no maximo um resumo por empresa e data local.

begin;

create table public.purchase_assistant_digest_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  schedule_count integer not null default 0 check (schedule_count >= 0),
  overdue_schedule_count integer not null default 0 check (overdue_schedule_count >= 0),
  suggestion_count integer not null default 0 check (suggestion_count >= 0),
  created_at timestamptz not null default now(),
  unique (company_id, user_id, digest_date)
);

create index purchase_assistant_digest_runs_user_date_idx
on public.purchase_assistant_digest_runs(user_id, digest_date desc);

alter table public.purchase_assistant_digest_runs enable row level security;
revoke all on public.purchase_assistant_digest_runs from anon, authenticated;

create or replace function public.rpc_service_create_purchase_assistant_digest(
  p_company_id uuid,
  p_schedule_count integer,
  p_overdue_schedule_count integer,
  p_suggestion_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_digest_date date;
  v_schedule_count integer := greatest(0, least(coalesce(p_schedule_count, 0), 999));
  v_overdue_count integer := greatest(0, least(coalesce(p_overdue_schedule_count, 0), 999));
  v_suggestion_count integer := greatest(0, least(coalesce(p_suggestion_count, 0), 999));
  v_title text;
  v_message text;
  v_priority text;
  v_created integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Funcao exclusiva do servico agendado';
  end if;

  if v_schedule_count + v_suggestion_count = 0 then
    return 0;
  end if;

  select coalesce(nullif(c.timezone, ''), 'America/Sao_Paulo')
  into v_timezone
  from public.companies c
  where c.id = p_company_id;

  if v_timezone is null then
    return 0;
  end if;

  v_digest_date := (now() at time zone v_timezone)::date;
  v_priority := case when v_overdue_count > 0 then 'high' else 'normal' end;
  v_title := case
    when v_overdue_count > 0 then 'Há compras recorrentes atrasadas'
    else 'Assistente de compras: revisão do dia'
  end;
  v_message := concat_ws(
    ' · ',
    case when v_schedule_count > 0
      then v_schedule_count || case when v_schedule_count = 1
        then ' compra agendada' else ' compras agendadas' end
    end,
    case when v_suggestion_count > 0
      then v_suggestion_count || case when v_suggestion_count = 1
        then ' reposição sugerida' else ' reposições sugeridas' end
    end
  );

  with recipients as (
    select user_id from private.members_with_permission(p_company_id, 'purchase_round.create')
    union
    select user_id from private.members_with_permission(p_company_id, 'order.create')
    union
    select user_id from private.members_with_permission(p_company_id, 'product.update')
  ),
  claimed as (
    insert into public.purchase_assistant_digest_runs (
      company_id, user_id, digest_date, schedule_count,
      overdue_schedule_count, suggestion_count
    )
    select
      p_company_id, r.user_id, v_digest_date, v_schedule_count,
      v_overdue_count, v_suggestion_count
    from recipients r
    on conflict (company_id, user_id, digest_date) do nothing
    returning user_id
  ),
  inserted as (
    insert into public.notifications (
      company_id, user_id, type, title, message, priority,
      resource_type, action_url, metadata
    )
    select
      p_company_id,
      c.user_id,
      'purchase_assistant.digest',
      v_title,
      v_message,
      v_priority,
      'purchase_assistant',
      '/dashboard#assistente-compras',
      jsonb_build_object(
        'digest_date', v_digest_date,
        'schedule_count', v_schedule_count,
        'overdue_schedule_count', v_overdue_count,
        'suggestion_count', v_suggestion_count
      )
    from claimed c
    returning id
  )
  select count(*)::integer into v_created from inserted;

  return v_created;
end;
$$;

revoke all on function public.rpc_service_create_purchase_assistant_digest(uuid,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.rpc_service_create_purchase_assistant_digest(uuid,integer,integer,integer)
  to service_role;

commit;
