-- Distingue ausência de resposta de uma recusa explícita no relatório.
-- Snapshots antigos permanecem imutáveis e são normalizados pela aplicação.

do $$
begin
  if to_regprocedure(
    'private.build_purchase_round_report_legacy(uuid,uuid)'
  ) is null then
    execute 'alter function private.build_purchase_round_report(uuid, uuid) '
      || 'rename to build_purchase_round_report_legacy';
  end if;
end;
$$;

create or replace function private.normalize_purchase_round_report_items(
  p_items jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_offer jsonb;
  v_offers jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_offers := '[]'::jsonb;
    for v_offer in
      select value
      from jsonb_array_elements(coalesce(v_item -> 'offers', '[]'::jsonb))
    loop
      if v_offer ->> 'outcome' = 'no_price' then
        v_offer := jsonb_set(
          v_offer,
          '{outcome}',
          '"no_response"'::jsonb
        );
      end if;
      v_offers := v_offers || jsonb_build_array(v_offer);
    end loop;
    v_items := v_items || jsonb_build_array(
      jsonb_set(v_item, '{offers}', v_offers, true)
    );
  end loop;
  return v_items;
end;
$$;

create or replace function private.normalize_purchase_round_report_response_labels(
  p_report jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_group jsonb;
  v_supplier jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_suppliers jsonb := '[]'::jsonb;
  v_report jsonb := p_report;
  v_no_responses integer;
begin
  if p_report is null then
    return null;
  end if;

  for v_group in
    select value
    from jsonb_array_elements(coalesce(p_report -> 'groups', '[]'::jsonb))
  loop
    v_groups := v_groups || jsonb_build_array(
      jsonb_set(
        v_group,
        '{items}',
        private.normalize_purchase_round_report_items(v_group -> 'items'),
        true
      )
    );
  end loop;

  for v_supplier in
    select value
    from jsonb_array_elements(coalesce(p_report -> 'suppliers', '[]'::jsonb))
  loop
    v_no_responses := coalesce(
      (v_supplier ->> 'noResponses')::integer,
      (v_supplier ->> 'noPrice')::integer,
      0
    );
    v_suppliers := v_suppliers || jsonb_build_array(
      (v_supplier - 'noPrice')
      || jsonb_build_object('noResponses', v_no_responses)
    );
  end loop;

  v_report := jsonb_set(
    v_report,
    '{items}',
    private.normalize_purchase_round_report_items(p_report -> 'items'),
    true
  );
  v_report := jsonb_set(v_report, '{groups}', v_groups, true);
  v_report := jsonb_set(v_report, '{suppliers}', v_suppliers, true);
  return v_report;
end;
$$;

create or replace function private.build_purchase_round_report(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.normalize_purchase_round_report_response_labels(
    private.build_purchase_round_report_legacy(
      p_company_id,
      p_purchase_round_id
    )
  );
$$;

revoke all on function private.normalize_purchase_round_report_items(jsonb)
  from public, anon, authenticated;
revoke all on function private.normalize_purchase_round_report_response_labels(jsonb)
  from public, anon, authenticated;
revoke all on function private.build_purchase_round_report_legacy(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.build_purchase_round_report(uuid, uuid)
  from public, anon, authenticated;
