-- 0115_correct_item_temporarily_unavailable.sql
--
-- PROBLEMA
-- O fornecedor responde a cotação com preço e, na hora de fechar, avisa que o
-- produto acabou. O link já aceita "sem disponibilidade agora"
-- (is_available = false, sem preço — 0072), mas a correção do comprador não
-- conseguia chegar a esse estado: o preço novo era
-- coalesce(p_quoted_price, preço antigo), então o preço velho nunca saía.
--
-- IMPACTO
-- Marcar o item como indisponível deixava o preço antigo na resposta, e ele
-- seguia concorrendo como melhor preço e podendo ser alocado.
--
-- SOLUCAO
-- Quando o estado final é "sem disponibilidade" ou "não fornece", a correção
-- apaga o preço (fica registrado em response_item_corrections, como os demais
-- campos) e cancela as alocações em rascunho que apontavam para essa resposta.
-- Alocação já confirmada (pedido gerado) bloqueia a correção: aí o conserto é
-- no pedido, não na cotação.
--
-- A assinatura não muda; rpc_correct_quotation_item_with_conversion (0086)
-- continua chamando esta função.

begin;

create or replace function public.rpc_correct_quotation_response_item(
  p_company_id uuid,
  p_quotation_response_item_id uuid,
  p_quoted_price numeric default null,
  p_is_available boolean default null,
  p_does_not_supply boolean default null,
  p_notes text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.quotation_response_items;
  v_new_price numeric(18,6);
  v_new_available boolean;
  v_new_does_not_supply boolean;
  v_new_notes text;
  v_offered boolean;
  v_cancelled integer := 0;
begin
  perform private.require_permission(p_company_id, 'quotation_response.correct');

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo da correção é obrigatório';
  end if;

  select *
  into v_old
  from public.quotation_response_items qri
  where qri.id = p_quotation_response_item_id
    and qri.company_id = p_company_id
  for update;

  if v_old.id is null then
    raise exception 'Resposta não encontrada';
  end if;

  v_new_available := coalesce(p_is_available, v_old.is_available);
  v_new_does_not_supply := coalesce(p_does_not_supply, v_old.does_not_supply);
  v_new_notes := coalesce(p_notes, v_old.notes);
  v_offered := not v_new_does_not_supply and coalesce(v_new_available, true);

  -- Sem oferta não há preço: é o mesmo estado que o link grava (0072).
  if v_offered then
    v_new_price := coalesce(p_quoted_price, v_old.quoted_price);
  else
    if p_quoted_price is not null then
      raise exception 'Produto indisponível não deve ter preço';
    end if;
    v_new_price := null;
  end if;

  if v_new_price is not null and v_new_price < 0 then
    raise exception 'Preço inválido';
  end if;

  if v_new_does_not_supply = true and v_new_available = true then
    raise exception 'Item não pode estar disponível e marcado como não fornecido';
  end if;

  if not v_offered then
    if exists (
      select 1
      from public.purchase_allocations pa
      where pa.company_id = p_company_id
        and pa.quotation_response_item_id = v_old.id
        and pa.status = 'confirmed'
    ) then
      raise exception 'Este item já virou pedido para este fornecedor; ajuste pelo pedido';
    end if;

    update public.purchase_allocations
    set status = 'cancelled'
    where company_id = p_company_id
      and quotation_response_item_id = v_old.id
      and status = 'draft';
    get diagnostics v_cancelled = row_count;
  end if;

  if v_new_price is distinct from v_old.quoted_price then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'quoted_price',
      to_jsonb(v_old.quoted_price), to_jsonb(v_new_price),
      p_reason, auth.uid()
    );
  end if;

  if v_new_available is distinct from v_old.is_available then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'is_available',
      to_jsonb(v_old.is_available), to_jsonb(v_new_available),
      p_reason, auth.uid()
    );
  end if;

  if v_new_does_not_supply is distinct from v_old.does_not_supply then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'does_not_supply',
      to_jsonb(v_old.does_not_supply), to_jsonb(v_new_does_not_supply),
      p_reason, auth.uid()
    );
  end if;

  if v_new_notes is distinct from v_old.notes then
    insert into public.response_item_corrections (
      company_id, quotation_response_item_id, field_name,
      old_value, new_value, reason, corrected_by
    ) values (
      p_company_id, v_old.id, 'notes',
      to_jsonb(v_old.notes), to_jsonb(v_new_notes),
      p_reason, auth.uid()
    );
  end if;

  update public.quotation_response_items
  set quoted_price = v_new_price,
      is_available = v_new_available,
      does_not_supply = v_new_does_not_supply,
      notes = v_new_notes
  where id = v_old.id
    and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'quotation.response_corrected',
    'quotation_response_item',
    v_old.id,
    jsonb_build_object(
      'reason', p_reason,
      'cancelled_allocations', v_cancelled
    )
  );

  return jsonb_build_object(
    'quotation_response_item_id', v_old.id,
    'quoted_price', v_new_price,
    'is_available', v_new_available,
    'does_not_supply', v_new_does_not_supply,
    'cancelled_allocations', v_cancelled
  );
end;
$$;

revoke all on function public.rpc_correct_quotation_response_item(
  uuid,uuid,numeric,boolean,boolean,text,text
) from public, anon;

grant execute on function public.rpc_correct_quotation_response_item(
  uuid,uuid,numeric,boolean,boolean,text,text
) to authenticated;

commit;
