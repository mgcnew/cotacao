-- 0039_supplier_group_distribution.sql
--
-- Distribuicao de grupos por fornecedor e retirada auditavel de participantes.
--
-- A tabela supplier_quotation_items continua sendo a fonte do link publico:
-- ela materializa os itens que cada fornecedor recebe. A nova tabela abaixo
-- guarda a intencao do comprador no nivel em que a tela trabalha (grupo), para
-- que novos produtos adicionados a um grupo herdem os destinatarios corretos.

begin;

-- ============================================================
-- PARTICIPACAO DO FORNECEDOR: RETIRADA LOGICA
-- ============================================================

alter table public.round_suppliers
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id) on delete set null,
  add column removal_reason text;

alter table public.round_suppliers
  add constraint round_suppliers_removal_reason_length
  check (removal_reason is null or char_length(btrim(removal_reason)) between 3 and 500);

create index round_suppliers_active_round_idx
on public.round_suppliers(company_id, purchase_round_id)
where removed_at is null;

-- ============================================================
-- GRUPOS ESCOLHIDOS PARA CADA FORNECEDOR
-- ============================================================

create table public.round_supplier_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  round_supplier_id uuid not null,
  group_id uuid not null,
  added_after_initial_send boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (round_supplier_id, group_id),

  foreign key (company_id, round_supplier_id)
    references public.round_suppliers(company_id, id) on delete cascade,
  foreign key (company_id, group_id)
    references public.purchase_round_groups(company_id, id) on delete cascade
);

create index round_supplier_groups_supplier_idx
on public.round_supplier_groups(round_supplier_id);

create index round_supplier_groups_group_idx
on public.round_supplier_groups(group_id);

create index round_supplier_groups_active_supplier_idx
on public.round_supplier_groups(company_id, round_supplier_id)
where removed_at is null;

create trigger round_supplier_groups_set_updated_at
before update on public.round_supplier_groups
for each row execute function private.set_updated_at();

create or replace function private.validate_round_supplier_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_supplier_round_id uuid;
  v_group_round_id uuid;
begin
  select rs.purchase_round_id
    into v_supplier_round_id
  from public.round_suppliers rs
  where rs.id = new.round_supplier_id
    and rs.company_id = new.company_id;

  select g.purchase_round_id
    into v_group_round_id
  from public.purchase_round_groups g
  where g.id = new.group_id
    and g.company_id = new.company_id;

  if v_supplier_round_id is null
     or v_group_round_id is null
     or v_supplier_round_id <> v_group_round_id then
    raise exception 'Fornecedor e grupo precisam pertencer à mesma rodada';
  end if;

  return new;
end;
$$;

create trigger round_supplier_groups_validate_round
before insert or update of company_id, round_supplier_id, group_id
on public.round_supplier_groups
for each row execute function private.validate_round_supplier_group();

revoke all on function private.validate_round_supplier_group()
from public, anon, authenticated;

alter table public.round_supplier_groups enable row level security;

revoke all on public.round_supplier_groups from public, anon;
grant select on public.round_supplier_groups to authenticated;

create policy round_supplier_groups_select_member
on public.round_supplier_groups
for select to authenticated
using ((select private.is_company_member(company_id)));

-- Rodadas antigas equivaliam a "todos os grupos vinculados". O backfill
-- preserva exatamente esse comportamento sem inventar novas atribuicoes.
insert into public.round_supplier_groups (
  company_id,
  round_supplier_id,
  group_id,
  added_after_initial_send
)
select
  sqi.company_id,
  sqi.round_supplier_id,
  qi.group_id,
  bool_or(sqi.added_after_initial_send)
from public.supplier_quotation_items sqi
join public.quotation_items qi
  on qi.id = sqi.quotation_item_id
 and qi.company_id = sqi.company_id
where sqi.removed_at is null
group by sqi.company_id, sqi.round_supplier_id, qi.group_id
on conflict (round_supplier_id, group_id) do nothing;

-- ============================================================
-- AUXILIAR: RECALCULAR PROGRESSO DE UMA RESPOSTA
-- ============================================================

create or replace function private.recalculate_round_supplier_response(
  p_company_id uuid,
  p_round_supplier_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_id uuid;
  v_total integer;
  v_answered integer;
  v_status text;
begin
  select qr.id
    into v_response_id
  from public.quotation_responses qr
  where qr.company_id = p_company_id
    and qr.round_supplier_id = p_round_supplier_id;

  select count(*)::integer
    into v_total
  from public.supplier_quotation_items sqi
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = p_round_supplier_id
    and sqi.removed_at is null;

  if v_response_id is null then
    update public.round_suppliers rs
    set completed_at = null
    where rs.company_id = p_company_id
      and rs.id = p_round_supplier_id;

    return jsonb_build_object(
      'status', 'not_started',
      'answered_items', 0,
      'total_items', v_total
    );
  end if;

  select count(*)::integer
    into v_answered
  from public.quotation_response_items qri
  join public.supplier_quotation_items sqi
    on sqi.id = qri.supplier_quotation_item_id
   and sqi.company_id = qri.company_id
  where qri.company_id = p_company_id
    and qri.quotation_response_id = v_response_id
    and sqi.round_supplier_id = p_round_supplier_id
    and sqi.removed_at is null;

  v_status := case
    when v_total > 0 and v_answered >= v_total then 'completed'
    else 'partial'
  end;

  update public.quotation_responses qr
  set status = v_status
  where qr.company_id = p_company_id
    and qr.id = v_response_id;

  update public.round_suppliers rs
  set completed_at = case
    when v_status = 'completed' then coalesce(rs.completed_at, now())
    else null
  end
  where rs.company_id = p_company_id
    and rs.id = p_round_supplier_id;

  return jsonb_build_object(
    'status', v_status,
    'answered_items', v_answered,
    'total_items', v_total
  );
end;
$$;

revoke all on function private.recalculate_round_supplier_response(uuid, uuid)
from public, anon, authenticated;

-- ============================================================
-- RPC: ADICIONAR/ATUALIZAR FORNECEDOR E SEUS GRUPOS
-- ============================================================

create or replace function public.rpc_upsert_round_supplier_groups(
  p_company_id uuid,
  p_purchase_round_id uuid,
  p_supplier_id uuid,
  p_supplier_contact_id uuid,
  p_group_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_status text;
  v_round_supplier_id uuid;
  v_group_ids uuid[];
  v_group_count integer;
  v_expected_count integer;
  v_first_sent_at timestamptz;
  v_existed boolean := false;
  v_was_removed boolean := false;
  v_added_groups integer := 0;
  v_removed_groups integer := 0;
  v_active_items integer := 0;
  v_progress jsonb;
begin
  perform private.require_permission(p_company_id, 'purchase_round.update');

  select pr.status
    into v_round_status
  from public.purchase_rounds pr
  where pr.company_id = p_company_id
    and pr.id = p_purchase_round_id
  for update;

  if v_round_status is null then
    raise exception 'Rodada inexistente';
  end if;
  if v_round_status not in ('draft', 'active') then
    raise exception 'Rodada encerrada não permite alterar fornecedores';
  end if;

  select coalesce(array_agg(x.group_id order by x.group_id), array[]::uuid[])
    into v_group_ids
  from (
    select distinct unnest(coalesce(p_group_ids, array[]::uuid[])) as group_id
  ) x;

  v_expected_count := coalesce(cardinality(v_group_ids), 0);
  if v_expected_count = 0 then
    raise exception 'Escolha ao menos um grupo para o fornecedor';
  end if;

  select count(*)::integer
    into v_group_count
  from public.purchase_round_groups g
  where g.company_id = p_company_id
    and g.purchase_round_id = p_purchase_round_id
    and g.id = any(v_group_ids)
    and (
      g.status in ('draft', 'open')
      or exists (
        select 1
        from public.round_supplier_groups existing_group
        join public.round_suppliers existing_supplier
          on existing_supplier.id = existing_group.round_supplier_id
         and existing_supplier.company_id = existing_group.company_id
        where existing_group.company_id = p_company_id
          and existing_group.group_id = g.id
          and existing_group.removed_at is null
          and existing_supplier.purchase_round_id = p_purchase_round_id
          and existing_supplier.supplier_id = p_supplier_id
      )
    );

  if v_group_count <> v_expected_count then
    raise exception 'Um ou mais grupos são inválidos, encerrados ou de outra rodada';
  end if;

  if not exists (
    select 1
    from public.suppliers s
    where s.company_id = p_company_id
      and s.id = p_supplier_id
      and s.status = 'active'
  ) then
    raise exception 'Fornecedor inexistente ou inativo';
  end if;

  if not exists (
    select 1
    from public.supplier_contacts sc
    where sc.company_id = p_company_id
      and sc.id = p_supplier_contact_id
      and sc.supplier_id = p_supplier_id
      and sc.is_active = true
  ) then
    raise exception 'Contato ativo não pertence ao fornecedor';
  end if;

  select rs.id, rs.first_sent_at, (rs.removed_at is not null)
    into v_round_supplier_id, v_first_sent_at, v_was_removed
  from public.round_suppliers rs
  where rs.company_id = p_company_id
    and rs.purchase_round_id = p_purchase_round_id
    and rs.supplier_id = p_supplier_id
  for update;

  v_existed := v_round_supplier_id is not null;

  if v_existed then
    -- Resposta original nunca desaparece por uma edicao de distribuicao. Um
    -- grupo que ja recebeu preco permanece atribuido; para parar toda a
    -- participacao existe a RPC de retirada, que revoga o link e guarda motivo.
    if exists (
      select 1
      from public.quotation_response_items qri
      join public.supplier_quotation_items sqi
        on sqi.id = qri.supplier_quotation_item_id
       and sqi.company_id = qri.company_id
      join public.quotation_items qi
        on qi.id = sqi.quotation_item_id
       and qi.company_id = sqi.company_id
      where sqi.company_id = p_company_id
        and sqi.round_supplier_id = v_round_supplier_id
        and not (qi.group_id = any(v_group_ids))
    ) then
      raise exception 'Um grupo com resposta recebida não pode ser desmarcado; retire a participação inteira se necessário';
    end if;

    -- Uma decisao de compra ativa nao pode perder o vinculo que a justificou.
    if exists (
      select 1
      from public.purchase_allocations pa
      join public.quotation_items qi
        on qi.id = pa.quotation_item_id
       and qi.company_id = pa.company_id
      where pa.company_id = p_company_id
        and pa.purchase_round_id = p_purchase_round_id
        and pa.supplier_id = p_supplier_id
        and pa.status in ('draft', 'confirmed')
        and not (qi.group_id = any(v_group_ids))
    ) then
      raise exception 'Há decisão de compra ativa em um grupo que seria retirado deste fornecedor';
    end if;

    update public.round_suppliers rs
    set supplier_contact_id = p_supplier_contact_id,
        removed_at = null,
        removed_by = null,
        removal_reason = null
    where rs.company_id = p_company_id
      and rs.id = v_round_supplier_id;
  else
    insert into public.round_suppliers (
      company_id,
      purchase_round_id,
      supplier_id,
      supplier_contact_id
    )
    values (
      p_company_id,
      p_purchase_round_id,
      p_supplier_id,
      p_supplier_contact_id
    )
    returning id, first_sent_at
      into v_round_supplier_id, v_first_sent_at;
  end if;

  update public.round_supplier_groups rsg
  set removed_at = now()
  where rsg.company_id = p_company_id
    and rsg.round_supplier_id = v_round_supplier_id
    and rsg.removed_at is null
    and not (rsg.group_id = any(v_group_ids));
  get diagnostics v_removed_groups = row_count;

  insert into public.round_supplier_groups (
    company_id,
    round_supplier_id,
    group_id,
    added_after_initial_send
  )
  select
    p_company_id,
    v_round_supplier_id,
    g.id,
    v_first_sent_at is not null
  from public.purchase_round_groups g
  where g.company_id = p_company_id
    and g.purchase_round_id = p_purchase_round_id
    and g.id = any(v_group_ids)
  on conflict (round_supplier_id, group_id)
  do update set
    removed_at = null,
    added_after_initial_send =
      round_supplier_groups.added_after_initial_send
      or (
        round_supplier_groups.removed_at is not null
        and v_first_sent_at is not null
      );
  get diagnostics v_added_groups = row_count;

  -- Tira do link os itens dos grupos desmarcados. Respostas existentes ficam
  -- preservadas nas tabelas de resposta e continuam auditaveis.
  update public.supplier_quotation_items sqi
  set removed_at = now()
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = v_round_supplier_id
    and sqi.removed_at is null
    and exists (
      select 1
      from public.quotation_items qi
      where qi.company_id = p_company_id
        and qi.id = sqi.quotation_item_id
        and not (qi.group_id = any(v_group_ids))
    );

  -- Inclui/restaura todos os itens ativos dos grupos escolhidos.
  insert into public.supplier_quotation_items (
    company_id,
    round_supplier_id,
    quotation_item_id,
    added_after_initial_send
  )
  select
    p_company_id,
    v_round_supplier_id,
    qi.id,
    v_first_sent_at is not null
  from public.quotation_items qi
  join public.purchase_round_groups selected_group
    on selected_group.id = qi.group_id
   and selected_group.company_id = qi.company_id
  where qi.company_id = p_company_id
    and qi.purchase_round_id = p_purchase_round_id
    and qi.group_id = any(v_group_ids)
    and selected_group.status in ('draft', 'open')
    and qi.commercial_status <> 'cancelled'
  on conflict (round_supplier_id, quotation_item_id)
  do update set
    removed_at = null,
    added_after_initial_send =
      supplier_quotation_items.added_after_initial_send
      or (
        supplier_quotation_items.removed_at is not null
        and v_first_sent_at is not null
      );

  select count(*)::integer
    into v_active_items
  from public.supplier_quotation_items sqi
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = v_round_supplier_id
    and sqi.removed_at is null;

  if v_active_items = 0 then
    raise exception 'Os grupos escolhidos não possuem produtos ativos';
  end if;

  v_progress := private.recalculate_round_supplier_response(
    p_company_id,
    v_round_supplier_id
  );

  perform private.emit_domain_event(
    p_company_id,
    case
      when not v_existed then 'round_supplier.added'
      when v_was_removed then 'round_supplier.reactivated'
      else 'round_supplier.groups_updated'
    end,
    'round_supplier',
    v_round_supplier_id,
    jsonb_build_object(
      'purchase_round_id', p_purchase_round_id,
      'supplier_id', p_supplier_id,
      'group_ids', to_jsonb(v_group_ids),
      'active_items', v_active_items,
      'after_initial_send', v_first_sent_at is not null,
      'response_progress', v_progress
    ),
    'user',
    auth.uid(),
    null
  );

  return jsonb_build_object(
    'round_supplier_id', v_round_supplier_id,
    'group_ids', to_jsonb(v_group_ids),
    'active_items', v_active_items,
    'response_progress', v_progress
  );
end;
$$;

comment on function public.rpc_upsert_round_supplier_groups(uuid,uuid,uuid,uuid,uuid[])
is 'Adiciona ou atualiza um fornecedor da rodada e materializa os itens dos grupos escolhidos.';

revoke all on function public.rpc_upsert_round_supplier_groups(uuid,uuid,uuid,uuid,uuid[])
from public, anon;
grant execute on function public.rpc_upsert_round_supplier_groups(uuid,uuid,uuid,uuid,uuid[])
to authenticated;

-- ============================================================
-- RPC: RETIRAR FORNECEDOR SEM APAGAR HISTORICO
-- ============================================================

create or replace function public.rpc_remove_round_supplier(
  p_company_id uuid,
  p_round_supplier_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_supplier_id uuid;
  v_round_status text;
  v_reason text;
begin
  perform private.require_permission(p_company_id, 'purchase_round.update');

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Informe o motivo da retirada';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Motivo da retirada muito longo';
  end if;

  select rs.purchase_round_id, rs.supplier_id, pr.status
    into v_round_id, v_supplier_id, v_round_status
  from public.round_suppliers rs
  join public.purchase_rounds pr
    on pr.id = rs.purchase_round_id
   and pr.company_id = rs.company_id
  where rs.company_id = p_company_id
    and rs.id = p_round_supplier_id
  for update of rs, pr;

  if v_round_id is null then
    raise exception 'Fornecedor não encontrado nesta rodada';
  end if;
  if v_round_status not in ('draft', 'active') then
    raise exception 'Rodada encerrada não permite retirar fornecedores';
  end if;

  if exists (
    select 1
    from public.purchase_allocations pa
    where pa.company_id = p_company_id
      and pa.purchase_round_id = v_round_id
      and pa.supplier_id = v_supplier_id
      and pa.status in ('draft', 'confirmed')
  ) then
    raise exception 'Este fornecedor possui decisão de compra ativa e não pode ser retirado';
  end if;

  if exists (
    select 1
    from public.round_suppliers rs
    where rs.company_id = p_company_id
      and rs.id = p_round_supplier_id
      and rs.removed_at is not null
  ) then
    return jsonb_build_object(
      'round_supplier_id', p_round_supplier_id,
      'status', 'removed'
    );
  end if;

  update public.round_suppliers rs
  set removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = v_reason,
      completed_at = null
  where rs.company_id = p_company_id
    and rs.id = p_round_supplier_id;

  update public.round_supplier_groups rsg
  set removed_at = now()
  where rsg.company_id = p_company_id
    and rsg.round_supplier_id = p_round_supplier_id
    and rsg.removed_at is null;

  update public.supplier_quotation_items sqi
  set removed_at = now()
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = p_round_supplier_id
    and sqi.removed_at is null;

  update public.public_access_tokens t
  set revoked_at = now()
  where t.company_id = p_company_id
    and t.round_supplier_id = p_round_supplier_id
    and t.purpose = 'quotation_response'
    and t.revoked_at is null;

  perform private.emit_domain_event(
    p_company_id,
    'round_supplier.removed',
    'round_supplier',
    p_round_supplier_id,
    jsonb_build_object(
      'purchase_round_id', v_round_id,
      'supplier_id', v_supplier_id,
      'reason', v_reason
    ),
    'user',
    auth.uid(),
    null
  );

  return jsonb_build_object(
    'round_supplier_id', p_round_supplier_id,
    'status', 'removed'
  );
end;
$$;

comment on function public.rpc_remove_round_supplier(uuid,uuid,text)
is 'Retira um fornecedor da rodada, revoga seus links e preserva respostas e historico.';

revoke all on function public.rpc_remove_round_supplier(uuid,uuid,text)
from public, anon;
grant execute on function public.rpc_remove_round_supplier(uuid,uuid,text)
to authenticated;

-- ============================================================
-- ENVIO: RECUSAR PARTICIPACAO RETIRADA OU SEM ITENS
-- ============================================================

create or replace function public.rpc_mark_round_supplier_sent(
  p_company_id uuid,
  p_round_supplier_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_supplier_id uuid;
  v_active_items integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.send');

  select rs.purchase_round_id, rs.supplier_id
    into v_round_id, v_supplier_id
  from public.round_suppliers rs
  where rs.id = p_round_supplier_id
    and rs.company_id = p_company_id
    and rs.removed_at is null
  for update;

  if v_round_id is null then
    raise exception 'Fornecedor ativo da rodada não encontrado';
  end if;

  if not exists (
    select 1
    from public.purchase_rounds pr
    where pr.id = v_round_id
      and pr.company_id = p_company_id
      and pr.status in ('draft', 'active')
  ) then
    raise exception 'Rodada não permite envio';
  end if;

  select count(*)::integer
    into v_active_items
  from public.supplier_quotation_items sqi
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = p_round_supplier_id
    and sqi.removed_at is null;

  if v_active_items = 0 then
    raise exception 'Escolha ao menos um grupo com produtos antes do envio';
  end if;

  update public.round_suppliers rs
  set first_sent_at = coalesce(rs.first_sent_at, now())
  where rs.id = p_round_supplier_id
    and rs.company_id = p_company_id;

  update public.purchase_rounds pr
  set status = 'active',
      started_at = coalesce(pr.started_at, now())
  where pr.id = v_round_id
    and pr.company_id = p_company_id;

  update public.purchase_round_groups g
  set status = case when g.status = 'draft' then 'open' else g.status end
  where g.purchase_round_id = v_round_id
    and g.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'quotation.sent',
    'round_supplier',
    p_round_supplier_id,
    jsonb_build_object(
      'purchase_round_id', v_round_id,
      'supplier_id', v_supplier_id,
      'items', v_active_items
    )
  );

  return jsonb_build_object(
    'round_supplier_id', p_round_supplier_id,
    'purchase_round_id', v_round_id,
    'first_sent_at', (
      select rs.first_sent_at
      from public.round_suppliers rs
      where rs.id = p_round_supplier_id
        and rs.company_id = p_company_id
    ),
    'items', v_active_items
  );
end;
$$;

revoke all on function public.rpc_mark_round_supplier_sent(uuid,uuid)
from public, anon;
grant execute on function public.rpc_mark_round_supplier_sent(uuid,uuid)
to authenticated;

-- ============================================================
-- LISTA E INDICADORES: IGNORAR PARTICIPACOES RETIRADAS
-- ============================================================

create or replace view public.v_purchase_round_progress
with (security_invoker = true)
as
  select
    pr.company_id,
    pr.id as purchase_round_id,
    pr.title,
    pr.status,
    count(distinct qi.id) filter (
      where qi.commercial_status <> 'cancelled'
    ) as total_items,
    count(distinct rs.id) as total_suppliers,
    count(distinct rs.id) filter (
      where qr.status = 'completed'
    ) as suppliers_completed,
    count(distinct rs.id) filter (
      where coalesce(qr.status, 'not_started') <> 'completed'
    ) as suppliers_pending,
    count(distinct qi.id) filter (
      where qi.commercial_status = 'confirmed'
    ) as items_confirmed,
    count(distinct o.id) as orders_created,
    pr.created_at,
    pr.notes
  from public.purchase_rounds pr
  left join public.quotation_items qi
    on qi.purchase_round_id = pr.id
   and qi.company_id = pr.company_id
  left join public.round_suppliers rs
    on rs.purchase_round_id = pr.id
   and rs.company_id = pr.company_id
   and rs.removed_at is null
  left join public.quotation_responses qr
    on qr.round_supplier_id = rs.id
   and qr.company_id = rs.company_id
  left join public.orders o
    on o.purchase_round_id = pr.id
   and o.company_id = pr.company_id
  group by pr.company_id, pr.id, pr.title, pr.notes, pr.status, pr.created_at;

grant select on public.v_purchase_round_progress to authenticated;

create or replace function public.rpc_round_snapshot(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns table (
  itens_ativos integer,
  itens_com_resposta integer,
  itens_prontos integer,
  itens_alocados integer,
  grupos_abertos integer,
  fornecedores integer,
  fornecedores_enviados integer,
  fornecedores_responderam integer,
  itens_negociados integer,
  alocacoes_rascunho integer,
  pedidos_gerados integer
)
language sql
security invoker
set search_path = ''
as $$
  with itens as (
    select qi.id
    from public.quotation_items qi
    where qi.company_id = p_company_id
      and qi.purchase_round_id = p_purchase_round_id
      and qi.commercial_status <> 'cancelled'
  ),
  respondidos as (
    select distinct sqi.quotation_item_id as id
    from public.supplier_quotation_items sqi
    join public.quotation_response_items qri
      on qri.supplier_quotation_item_id = sqi.id
     and qri.company_id = sqi.company_id
    join public.round_suppliers rs
      on rs.id = sqi.round_supplier_id
     and rs.company_id = sqi.company_id
    where sqi.company_id = p_company_id
      and rs.purchase_round_id = p_purchase_round_id
      and qri.does_not_supply = false
      and qri.quoted_price is not null
  ),
  alocados as (
    select distinct pa.quotation_item_id as id
    from public.purchase_allocations pa
    where pa.company_id = p_company_id
      and pa.purchase_round_id = p_purchase_round_id
      and pa.status in ('draft', 'confirmed')
  )
  select
    (select count(*) from itens)::integer,
    (select count(*) from itens i join respondidos r on r.id = i.id)::integer,
    (select count(*) from itens i
       join respondidos r on r.id = i.id
       where not exists (select 1 from alocados a where a.id = i.id))::integer,
    (select count(*) from itens i join alocados a on a.id = i.id)::integer,
    (select count(*) from public.purchase_round_groups g
      where g.company_id = p_company_id
        and g.purchase_round_id = p_purchase_round_id
        and g.status = 'open')::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null)::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null
        and rs.first_sent_at is not null)::integer,
    (select count(*) from public.round_suppliers rs
      where rs.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id
        and rs.removed_at is null
        and rs.completed_at is not null)::integer,
    (select count(distinct sqi.quotation_item_id)
       from public.negotiations n
       join public.quotation_response_items qri
         on qri.id = n.quotation_response_item_id
        and qri.company_id = n.company_id
       join public.supplier_quotation_items sqi
         on sqi.id = qri.supplier_quotation_item_id
        and sqi.company_id = qri.company_id
       join public.round_suppliers rs
         on rs.id = sqi.round_supplier_id
        and rs.company_id = sqi.company_id
      where n.company_id = p_company_id
        and rs.purchase_round_id = p_purchase_round_id)::integer,
    (select count(*) from public.purchase_allocations pa
      where pa.company_id = p_company_id
        and pa.purchase_round_id = p_purchase_round_id
        and pa.status = 'draft')::integer,
    (select count(*) from public.orders o
      where o.company_id = p_company_id
        and o.purchase_round_id = p_purchase_round_id
        and o.status <> 'cancelled')::integer;
$$;

revoke all on function public.rpc_round_snapshot(uuid,uuid) from public, anon;
grant execute on function public.rpc_round_snapshot(uuid,uuid) to authenticated;

commit;
