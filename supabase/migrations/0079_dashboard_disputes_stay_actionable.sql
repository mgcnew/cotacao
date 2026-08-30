-- 0079_dashboard_disputes_stay_actionable.sql
--
-- A 0077 remove falsos positivos do painel. Agora que `to_dispute` passa a ser
-- uma etapa real do fluxo, a divergencia deve continuar na Central ate receber
-- uma solucao final. Esta migration e separada porque a 0077 pode ja ter sido
-- aplicada em ambientes existentes.

begin;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.rpc_dashboard_snapshot(uuid,integer,text[])'::regprocedure
  ) into v_definition;

  v_updated := replace(
    v_definition,
    'and c.status = ''pending''',
    'and c.status in (''pending'', ''to_dispute'')'
  );

  if v_updated = v_definition then
    raise exception 'Trecho de divergencias comerciais nao encontrado em rpc_dashboard_snapshot';
  end if;

  execute v_updated;
end;
$$;

comment on function public.rpc_dashboard_snapshot(uuid, int, text[])
is 'Retrato do dashboard: divergencias pendentes ou em contestacao continuam acionaveis ate a decisao final.';

commit;
