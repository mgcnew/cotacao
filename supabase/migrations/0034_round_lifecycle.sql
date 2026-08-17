-- 0034_round_lifecycle.sql
--
-- PROBLEMA
-- A rodada sabia nascer e sabia comecar. Nao sabia acabar.
--
-- `purchase_rounds.status` aceita 'completed' e 'cancelled' desde a 0007, e
-- `purchase_round.close` e `purchase_round.cancel` estao no seed de permissoes
-- (0005). Nenhuma transicao produzia esses estados: as duas permissoes nao
-- autorizavam nada e os dois estados eram inalcancaveis. Toda rodada ja
-- decidida ficava para sempre em "Em andamento", e a lista de compras juntava
-- lixo indistinguivel do trabalho de hoje.
--
-- `purchase_round_groups.status` tinha o mesmo destino, e pior: a coluna nascia
-- 'draft' e ficava 'draft' ate o fim do mundo, embora a secao 6 do documento
-- mestre diga que "cada grupo podera avancar independentemente. Um grupo pode
-- estar fechado enquanto outro aguarda respostas."
--
-- SOLUCAO
-- Cinco RPCs cobrindo as transicoes que faltavam. Todas checam permissao por
-- dentro e travam a linha antes de decidir (`for update`) -- duas abas abertas
-- na mesma rodada nao podem produzir dois estados.
--
-- COMO UM GRUPO SAI DE CENA
-- Fechar ou cancelar um grupo marca `removed_at` nos vinculos com fornecedor.
-- Nao e detalhe: e o que impede o fornecedor de responder um grupo ja
-- encerrado. `rpc_public_get_quotation` e `rpc_public_submit_quotation` (0014)
-- filtram `removed_at is null`, entao o item some do link e a submissao o
-- recusa -- sem precisar mexer em nenhuma das duas. E o mesmo mecanismo que
-- `removeQuotationItem` ja usava.
--
-- FECHAR x CANCELAR
-- Fechado e "decidi o que fazer aqui": os itens ainda abertos viram
-- 'closed_without_purchase', que a secao 16.5 define como encerrado sem compra.
-- Cancelado e "isto nao vale": os itens viram 'cancelled'. Item ja alocado ou
-- confirmado nao e tocado em nenhum dos dois -- a decisao de compra aconteceu,
-- e historico nao se reescreve.
--
-- CONCLUIR x CANCELAR A RODADA
-- Cancelar uma rodada que ja gerou pedido e recusado. Cancelar diz "isto nunca
-- aconteceu", e aconteceu: existe pedido com fornecedor esperando mercadoria.
-- O caminho ali e concluir, e cancelar os pedidos um a um se for o caso --
-- mesma logica de `rpc_cancel_order`, que recusa cancelar pedido ja recebido e
-- aponta o encerramento de saldo.
--
-- INICIAR
-- `rpc_activate_round` traz para o banco o que estava no TypeScript, e conserta
-- duas coisas no caminho: os grupos passam a 'open' junto (antes ficavam
-- 'draft' para sempre), e a contagem minima de itens passa a ignorar os
-- cancelados -- dava para iniciar uma rodada em que so tinha sobrado o que foi
-- retirado.
--
-- VERIFICADO apos aplicar, com JWT real e rollback:
--   iniciar rodada montada       active + started_at, grupos 'open'
--   iniciar sem item aberto      RECUSADO
--   iniciar duas vezes           RECUSADO 'ja foi iniciada'
--   fechar grupo                 closed, itens abertos -> closed_without_purchase,
--                                vinculos com removed_at
--   fechar grupo ja fechado      idempotente
--   concluir rodada              completed + completed_at, grupos fechados,
--                                tokens de cotacao revogados
--   cancelar rodada com pedido   RECUSADO, aponta concluir
--   cancelar rodada sem pedido   cancelled + cancelled_at, itens 'cancelled'
--   sem a permissao              RECUSADO 42501

begin;

-- ============================================================
-- AUXILIAR: TIRAR OS ITENS DE UM GRUPO DO LINK DO FORNECEDOR
-- ============================================================
-- Duas RPCs abaixo precisam disto, e a duplicata seria a parte perigosa de
-- copiar: esquecer `removed_at is null` faria a segunda chamada reescrever o
-- carimbo de quando o item saiu.

create or replace function private.retirar_itens_do_link(
  p_company_id uuid,
  p_group_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.supplier_quotation_items sqi
  set removed_at = now()
  where sqi.company_id = p_company_id
    and sqi.removed_at is null
    and sqi.quotation_item_id in (
      select q.id
      from public.quotation_items q
      where q.group_id = p_group_id
        and q.company_id = p_company_id
    );
$$;

revoke all on function private.retirar_itens_do_link(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- RPC: INICIAR A RODADA
-- ============================================================

create or replace function public.rpc_activate_round(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_itens integer;
  v_fornecedores integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.update');

  select r.status into v_status
  from public.purchase_rounds r
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Rodada inexistente';
  end if;
  if v_status <> 'draft' then
    raise exception 'Esta rodada já foi iniciada';
  end if;

  select count(*) into v_itens
  from public.quotation_items q
  where q.purchase_round_id = p_purchase_round_id
    and q.company_id = p_company_id
    and q.commercial_status = 'open';

  if v_itens = 0 then
    raise exception 'Adicione ao menos um produto antes de iniciar a rodada';
  end if;

  select count(*) into v_fornecedores
  from public.round_suppliers rs
  where rs.purchase_round_id = p_purchase_round_id
    and rs.company_id = p_company_id;

  if v_fornecedores = 0 then
    raise exception 'Convide ao menos um fornecedor antes de iniciar a rodada';
  end if;

  -- O grupo acompanha a rodada: em preparação enquanto ela é rascunho, aberto
  -- assim que ela começa. Daí em diante ele anda sozinho.
  update public.purchase_round_groups g
  set status = 'open'
  where g.purchase_round_id = p_purchase_round_id
    and g.company_id = p_company_id
    and g.status = 'draft';

  update public.purchase_rounds r
  set status = 'active',
      started_at = now()
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'purchase_round.activated',
    'purchase_round',
    p_purchase_round_id,
    jsonb_build_object('items', v_itens, 'suppliers', v_fornecedores),
    'user',
    auth.uid()
  );

  return jsonb_build_object(
    'purchase_round_id', p_purchase_round_id,
    'status', 'active',
    'items', v_itens,
    'suppliers', v_fornecedores
  );
end;
$$;

-- ============================================================
-- RPC: FECHAR UM GRUPO
-- ============================================================

create or replace function public.rpc_close_round_group(
  p_company_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_round_id uuid;
  v_encerrados integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.close');

  select g.status, g.purchase_round_id
  into v_status, v_round_id
  from public.purchase_round_groups g
  where g.id = p_group_id
    and g.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Grupo inexistente';
  end if;
  if v_status = 'closed' then
    return jsonb_build_object('group_id', p_group_id, 'status', 'closed');
  end if;
  if v_status = 'cancelled' then
    raise exception 'Grupo cancelado não pode ser fechado';
  end if;
  if v_status = 'draft' then
    raise exception 'Grupo ainda em preparação: inicie a rodada antes';
  end if;

  -- Item ainda em aberto vira encerrado sem compra (documento mestre, 16.5).
  -- Alocado e confirmado ficam: a decisão de compra aconteceu.
  update public.quotation_items q
  set commercial_status = 'closed_without_purchase'
  where q.group_id = p_group_id
    and q.company_id = p_company_id
    and q.commercial_status = 'open';

  get diagnostics v_encerrados = row_count;

  perform private.retirar_itens_do_link(p_company_id, p_group_id);

  update public.purchase_round_groups g
  set status = 'closed'
  where g.id = p_group_id
    and g.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'purchase_round_group.closed',
    'purchase_round_group',
    p_group_id,
    jsonb_build_object(
      'purchase_round_id', v_round_id,
      'items_closed_without_purchase', v_encerrados
    ),
    'user',
    auth.uid()
  );

  return jsonb_build_object(
    'group_id', p_group_id,
    'status', 'closed',
    'items_closed_without_purchase', v_encerrados
  );
end;
$$;

-- ============================================================
-- RPC: CANCELAR UM GRUPO
-- ============================================================

create or replace function public.rpc_cancel_round_group(
  p_company_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_round_id uuid;
  v_cancelados integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.cancel');

  select g.status, g.purchase_round_id
  into v_status, v_round_id
  from public.purchase_round_groups g
  where g.id = p_group_id
    and g.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Grupo inexistente';
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('group_id', p_group_id, 'status', 'cancelled');
  end if;

  if exists (
    select 1
    from public.quotation_items q
    where q.group_id = p_group_id
      and q.company_id = p_company_id
      and q.commercial_status in ('allocated', 'confirmed')
  ) then
    raise exception 'Este grupo já tem compra decidida; feche-o em vez de cancelar';
  end if;

  update public.quotation_items q
  set commercial_status = 'cancelled'
  where q.group_id = p_group_id
    and q.company_id = p_company_id
    and q.commercial_status = 'open';

  get diagnostics v_cancelados = row_count;

  perform private.retirar_itens_do_link(p_company_id, p_group_id);

  update public.purchase_round_groups g
  set status = 'cancelled'
  where g.id = p_group_id
    and g.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'purchase_round_group.cancelled',
    'purchase_round_group',
    p_group_id,
    jsonb_build_object(
      'purchase_round_id', v_round_id,
      'items_cancelled', v_cancelados
    ),
    'user',
    auth.uid()
  );

  return jsonb_build_object(
    'group_id', p_group_id,
    'status', 'cancelled',
    'items_cancelled', v_cancelados
  );
end;
$$;

-- ============================================================
-- RPC: CONCLUIR A RODADA
-- ============================================================

create or replace function public.rpc_complete_round(
  p_company_id uuid,
  p_purchase_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_grupos integer;
  v_itens integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.close');

  select r.status into v_status
  from public.purchase_rounds r
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Rodada inexistente';
  end if;
  if v_status = 'completed' then
    return jsonb_build_object('purchase_round_id', p_purchase_round_id, 'status', 'completed');
  end if;
  if v_status <> 'active' then
    raise exception 'Só uma rodada em andamento pode ser concluída';
  end if;

  -- Concluir encerra o que ficou em aberto. É explícito: a tela diz quantos
  -- itens vão fechar sem compra antes de perguntar.
  update public.quotation_items q
  set commercial_status = 'closed_without_purchase'
  where q.purchase_round_id = p_purchase_round_id
    and q.company_id = p_company_id
    and q.commercial_status = 'open';

  get diagnostics v_itens = row_count;

  update public.purchase_round_groups g
  set status = 'closed'
  where g.purchase_round_id = p_purchase_round_id
    and g.company_id = p_company_id
    and g.status in ('draft', 'open');

  get diagnostics v_grupos = row_count;

  -- Rodada concluída não recebe mais resposta. Enquanto o token vale, o
  -- fornecedor responderia por fora desta transação.
  update public.public_access_tokens t
  set revoked_at = now()
  where t.company_id = p_company_id
    and t.purpose = 'quotation_response'
    and t.revoked_at is null
    and t.round_supplier_id in (
      select rs.id
      from public.round_suppliers rs
      where rs.purchase_round_id = p_purchase_round_id
        and rs.company_id = p_company_id
    );

  update public.purchase_rounds r
  set status = 'completed',
      completed_at = now()
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'purchase_round.completed',
    'purchase_round',
    p_purchase_round_id,
    jsonb_build_object(
      'groups_closed', v_grupos,
      'items_closed_without_purchase', v_itens
    ),
    'user',
    auth.uid()
  );

  return jsonb_build_object(
    'purchase_round_id', p_purchase_round_id,
    'status', 'completed',
    'groups_closed', v_grupos,
    'items_closed_without_purchase', v_itens
  );
end;
$$;

-- ============================================================
-- RPC: CANCELAR A RODADA
-- ============================================================

create or replace function public.rpc_cancel_round(
  p_company_id uuid,
  p_purchase_round_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reason text;
  v_pedidos integer;
  v_itens integer;
begin
  perform private.require_permission(p_company_id, 'purchase_round.cancel');

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  select r.status into v_status
  from public.purchase_rounds r
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id
  for update;

  if v_status is null then
    raise exception 'Rodada inexistente';
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('purchase_round_id', p_purchase_round_id, 'status', 'cancelled');
  end if;
  if v_status = 'completed' then
    raise exception 'Rodada concluída não pode ser cancelada';
  end if;

  -- Pedido gerado significa fornecedor esperando mercadoria. Cancelar a rodada
  -- diria que isto nunca aconteceu, e aconteceu.
  select count(*) into v_pedidos
  from public.orders o
  where o.purchase_round_id = p_purchase_round_id
    and o.company_id = p_company_id
    and o.status <> 'cancelled';

  if v_pedidos > 0 then
    raise exception 'Esta rodada já gerou % pedido(s); conclua-a, ou cancele os pedidos antes', v_pedidos;
  end if;

  update public.quotation_items q
  set commercial_status = 'cancelled'
  where q.purchase_round_id = p_purchase_round_id
    and q.company_id = p_company_id
    and q.commercial_status = 'open';

  get diagnostics v_itens = row_count;

  update public.supplier_quotation_items sqi
  set removed_at = now()
  where sqi.company_id = p_company_id
    and sqi.removed_at is null
    and sqi.quotation_item_id in (
      select q.id
      from public.quotation_items q
      where q.purchase_round_id = p_purchase_round_id
        and q.company_id = p_company_id
    );

  update public.purchase_round_groups g
  set status = 'cancelled'
  where g.purchase_round_id = p_purchase_round_id
    and g.company_id = p_company_id
    and g.status in ('draft', 'open');

  update public.public_access_tokens t
  set revoked_at = now()
  where t.company_id = p_company_id
    and t.purpose = 'quotation_response'
    and t.revoked_at is null
    and t.round_supplier_id in (
      select rs.id
      from public.round_suppliers rs
      where rs.purchase_round_id = p_purchase_round_id
        and rs.company_id = p_company_id
    );

  update public.purchase_rounds r
  set status = 'cancelled',
      cancelled_at = now()
  where r.id = p_purchase_round_id
    and r.company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'purchase_round.cancelled',
    'purchase_round',
    p_purchase_round_id,
    jsonb_build_object(
      'previous_status', v_status,
      'reason', v_reason,
      'items_cancelled', v_itens
    ),
    'user',
    auth.uid()
  );

  return jsonb_build_object(
    'purchase_round_id', p_purchase_round_id,
    'status', 'cancelled',
    'items_cancelled', v_itens
  );
end;
$$;

-- ============================================================
-- GRANTS
-- ============================================================

revoke all on function public.rpc_activate_round(uuid, uuid) from public, anon;
revoke all on function public.rpc_close_round_group(uuid, uuid) from public, anon;
revoke all on function public.rpc_cancel_round_group(uuid, uuid) from public, anon;
revoke all on function public.rpc_complete_round(uuid, uuid) from public, anon;
revoke all on function public.rpc_cancel_round(uuid, uuid, text) from public, anon;

grant execute on function public.rpc_activate_round(uuid, uuid) to authenticated;
grant execute on function public.rpc_close_round_group(uuid, uuid) to authenticated;
grant execute on function public.rpc_cancel_round_group(uuid, uuid) to authenticated;
grant execute on function public.rpc_complete_round(uuid, uuid) to authenticated;
grant execute on function public.rpc_cancel_round(uuid, uuid, text) to authenticated;

commit;
