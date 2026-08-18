-- Lançar preço no lugar do fornecedor.
--
-- O QUE FALTAVA
--
-- O comprador manda o link, mas liga para negociar — e quando consegue o
-- desconto não pede ao fornecedor que entre no link de novo: ele mesmo lança.
-- Esse caminho estava previsto desde o começo e nunca foi construído:
--
--   * `quotation_responses.source` já aceita 'manual' (CHECK da 0008);
--   * `quotation_responses.entered_by` existe para guardar quem digitou;
--   * a permissão `quotation_response.manual_create` — "Registrar resposta
--     manual" — já está na semente da 0005.
--
-- Só a função e a tela faltavam. Na comparação, a célula de quem não respondeu
-- dizia "aguardando" e não oferecia nada.
--
-- O QUE ESTA RPC NÃO FAZ
--
-- Corrigir. Item que já tem resposta — do link ou lançada aqui — se conserta
-- por `rpc_correct_quotation_response_item`, que guarda o histórico da
-- correção. Esta função recusa e diz isso, para não haver dois caminhos
-- gravando por cima do mesmo valor com regras diferentes.
--
-- Negociação também continua sendo outra coisa: `rpc_record_negotiation`
-- registra que um preço JÁ RESPONDIDO mudou por conversa, preservando o
-- original. Aqui é o primeiro preço, quando ele nunca chegou pelo link.
--
-- `security definer` como as demais RPCs de comprador, com a permissão
-- verificada logo na entrada.

create or replace function public.rpc_record_manual_quotation_item(
  p_company_id uuid,
  p_supplier_quotation_item_id uuid,
  p_quoted_price numeric default null,
  p_does_not_supply boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_supplier_id uuid;
  v_supplier_id uuid;
  v_product_id uuid;
  v_round_status text;
  v_response_id uuid;
  v_response_item_id uuid;
  v_total_items integer;
  v_answered_items integer;
  v_status text;
begin
  perform private.require_permission(p_company_id, 'quotation_response.manual_create');

  select sqi.round_supplier_id, rs.supplier_id, qi.product_id, pr.status
    into v_round_supplier_id, v_supplier_id, v_product_id, v_round_status
  from public.supplier_quotation_items sqi
  join public.round_suppliers rs
    on rs.id = sqi.round_supplier_id and rs.company_id = sqi.company_id
  join public.quotation_items qi
    on qi.id = sqi.quotation_item_id and qi.company_id = sqi.company_id
  join public.purchase_rounds pr
    on pr.id = rs.purchase_round_id and pr.company_id = rs.company_id
  where sqi.id = p_supplier_quotation_item_id
    and sqi.company_id = p_company_id
    and sqi.removed_at is null;

  if v_round_supplier_id is null then
    raise exception 'Item não pertence a esta cotação';
  end if;

  if v_round_status <> 'active' then
    raise exception 'A rodada precisa estar em andamento para lançar preço';
  end if;

  if p_does_not_supply = false and p_quoted_price is null then
    raise exception 'Informe o preço, ou marque que o fornecedor não fornece';
  end if;

  if p_quoted_price is not null and p_quoted_price < 0 then
    raise exception 'Preço não pode ser negativo';
  end if;

  -- A resposta pode já existir: o fornecedor respondeu parte pelo link e o
  -- resto veio por telefone. Nesse caso `source` NÃO é reescrito — quem
  -- respondeu primeiro foi o link, e o histórico deve dizer isso.
  insert into public.quotation_responses (
    company_id, round_supplier_id, source, status, started_at, entered_by
  )
  values (
    p_company_id, v_round_supplier_id, 'manual', 'in_progress', now(), auth.uid()
  )
  on conflict (round_supplier_id)
  do update set
    started_at = coalesce(public.quotation_responses.started_at, excluded.started_at)
  returning id into v_response_id;

  if exists (
    select 1
    from public.quotation_response_items qri
    where qri.company_id = p_company_id
      and qri.quotation_response_id = v_response_id
      and qri.supplier_quotation_item_id = p_supplier_quotation_item_id
  ) then
    raise exception 'Este item já tem resposta; use a correção para alterá-la';
  end if;

  insert into public.quotation_response_items (
    company_id, quotation_response_id, supplier_quotation_item_id,
    quoted_price, is_available, does_not_supply, notes
  )
  values (
    p_company_id, v_response_id, p_supplier_quotation_item_id,
    case when p_does_not_supply then null else p_quoted_price end,
    case when p_does_not_supply then null else true end,
    p_does_not_supply,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_response_item_id;

  -- O catálogo aprende com a cotação, como aprende pelo link. `source` fica
  -- 'manual' porque quem declarou foi o comprador, não o fornecedor.
  insert into public.supplier_products (
    company_id, supplier_id, product_id, status, source
  )
  values (
    p_company_id, v_supplier_id, v_product_id,
    case when p_does_not_supply then 'does_not_supply' else 'confirmed' end,
    'manual'
  )
  on conflict (company_id, supplier_id, product_id)
  do update set
    status = case when p_does_not_supply then 'does_not_supply' else 'confirmed' end,
    source = 'manual',
    updated_at = now();

  select count(*) into v_total_items
  from public.supplier_quotation_items sqi
  where sqi.company_id = p_company_id
    and sqi.round_supplier_id = v_round_supplier_id
    and sqi.removed_at is null;

  select count(*) into v_answered_items
  from public.quotation_response_items qri
  where qri.company_id = p_company_id
    and qri.quotation_response_id = v_response_id;

  v_status := case
    when v_answered_items >= v_total_items then 'completed'
    else 'partial'
  end;

  update public.quotation_responses
  set status = v_status,
      submitted_at = now()
  where id = v_response_id and company_id = p_company_id;

  update public.round_suppliers
  set completed_at = case when v_status = 'completed' then now() else null end
  where id = v_round_supplier_id and company_id = p_company_id;

  -- Evento próprio, e não `quotation.response_submitted`: no feed, "Fornecedor
  -- respondeu a cotação" seria mentira — quem lançou foi quem compra.
  perform private.emit_domain_event(
    p_company_id,
    'quotation.manual_response_recorded',
    'round_supplier',
    v_round_supplier_id,
    jsonb_build_object(
      'quotation_response_item_id', v_response_item_id,
      'quoted_price', p_quoted_price,
      'does_not_supply', p_does_not_supply,
      'status', v_status,
      'answered_items', v_answered_items,
      'total_items', v_total_items
    ),
    'user',
    auth.uid(),
    null
  );

  return v_response_item_id;
end;
$$;

comment on function public.rpc_record_manual_quotation_item is
  'Lança o preço de um item no lugar do fornecedor, quando ele respondeu por fora do link.';

revoke all on function public.rpc_record_manual_quotation_item(uuid,uuid,numeric,boolean,text)
  from public, anon;
grant execute on function public.rpc_record_manual_quotation_item(uuid,uuid,numeric,boolean,text)
  to authenticated;
