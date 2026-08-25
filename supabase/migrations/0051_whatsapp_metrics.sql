create index if not exists whatsapp_messages_company_direction_time_idx
on public.whatsapp_messages(company_id, direction, occurred_at desc);

create or replace function public.rpc_whatsapp_metrics(
  p_company_id uuid,
  p_days integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not (select private.is_company_member(p_company_id)) then
    raise exception 'Empresa inválida ou usuário sem acesso';
  end if;

  with valid_messages as (
    select
      id,
      conversation_id,
      direction,
      status,
      occurred_at,
      delivered_at,
      read_at
    from public.whatsapp_messages
    where company_id = p_company_id
      and occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
      and status <> 'deleted'
      and (direction = 'inbound' or status <> 'failed')
  ),
  ordered_messages as (
    select
      *,
      lead(direction) over (
        partition by conversation_id order by occurred_at, id
      ) as next_direction,
      lead(occurred_at) over (
        partition by conversation_id order by occurred_at, id
      ) as next_occurred_at
    from valid_messages
  )
  select jsonb_build_object(
    'sent', count(*) filter (where direction = 'outbound'),
    'delivered', count(*) filter (
      where direction = 'outbound'
        and (delivered_at is not null or read_at is not null or status in ('delivered', 'read', 'played'))
    ),
    'responseOpportunities', count(*) filter (
      where direction = 'outbound'
        and (next_direction = 'inbound' or next_direction is null)
    ),
    'responded', count(*) filter (
      where direction = 'outbound' and next_direction = 'inbound'
    ),
    'averageResponseSeconds', avg(
      extract(epoch from (next_occurred_at - occurred_at))
    ) filter (where direction = 'outbound' and next_direction = 'inbound')
  )
  into v_result
  from ordered_messages;

  return coalesce(v_result, jsonb_build_object(
    'sent', 0,
    'delivered', 0,
    'responseOpportunities', 0,
    'responded', 0,
    'averageResponseSeconds', null
  ));
end;
$$;

revoke all on function public.rpc_whatsapp_metrics(uuid, integer) from public, anon;
grant execute on function public.rpc_whatsapp_metrics(uuid, integer) to authenticated;
