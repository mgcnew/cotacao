-- 0102_product_unit_lock_on_commitment.sql
-- A trava de unidades passa a olhar compromisso, não participação.
--
-- A regra de 0089 bloqueava a correção assim que o produto entrava em
-- quotation_items — ou seja, assim que o comprador o colocava na rodada, antes
-- de qualquer fornecedor ver a lista. Isso fechava a porta exatamente no
-- momento em que o erro costuma aparecer: montando a rodada e relendo os itens.
-- O mesmo acontecia com pedido em rascunho.
--
-- O que realmente não pode mudar é a unidade sob a qual outra pessoa já
-- escreveu um número. Só isso trava agora.

begin;

create or replace function private.product_units_lock_reason(
  p_company_id uuid,
  p_product_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Resposta de fornecedor. Estar na rodada não basta: o que prende a unidade é
  -- o fornecedor ter escrito preço, marcado disponibilidade ou declarado que não
  -- fornece. Resposta ainda em rascunho conta — o preço foi digitado olhando a
  -- unidade que estava na tela, e trocá-la agora reinterpreta aquele número.
  if exists (
    select 1
    from public.quotation_response_items response_item
    join public.supplier_quotation_items supplier_item
      on supplier_item.company_id = response_item.company_id
     and supplier_item.id = response_item.supplier_quotation_item_id
    join public.quotation_items item
      on item.company_id = supplier_item.company_id
     and item.id = supplier_item.quotation_item_id
    where response_item.company_id = p_company_id
      and item.product_id = p_product_id
      and (
        response_item.quoted_price is not null
        or response_item.is_available is not null
        or response_item.does_not_supply
      )
  ) then
    return 'As unidades não podem mais ser alteradas porque um fornecedor já respondeu sobre este produto.';
  end if;

  -- Pedido que saiu do rascunho. A revisão enviada levou unidade e quantidade ao
  -- fornecedor; mudar a unidade depois desalinha a conferência do recebimento do
  -- que foi combinado. Rascunho e revisão cancelada não travam.
  if exists (
    select 1
    from public.order_revision_items item
    join public.order_revisions revision
      on revision.company_id = item.company_id
     and revision.id = item.order_revision_id
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and revision.status in ('sent', 'confirmed', 'contested', 'superseded')
  ) then
    return 'As unidades não podem mais ser alteradas porque este produto já foi enviado em um pedido.';
  end if;

  -- Inalterado: nota fiscal conferida é número de terceiro já reconciliado.
  if exists (
    select 1
    from public.historical_nfe_items item
    join public.historical_nfe_imports history
      on history.company_id = item.company_id
     and history.id = item.import_id
     and history.status = 'posted'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.reconciliation_status = 'matched'
  ) then
    return 'As unidades não podem mais ser alteradas porque o produto possui histórico fiscal confirmado.';
  end if;

  -- Inalterado: bloqueio reversível, não definitivo. A quantidade pedida na
  -- lista foi escrita numa unidade; tire de lá e corrija à vontade.
  if exists (
    select 1
    from public.shopping_list_items item
    join public.shopping_lists list
      on list.company_id = item.company_id
     and list.id = item.shopping_list_id
     and list.status = 'open'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.status = 'pending'
  ) then
    return 'Retire o produto da lista de compras aberta antes de alterar suas unidades.';
  end if;

  return null;
end;
$$;

comment on function private.product_units_lock_reason(uuid, uuid) is
  'Motivo do bloqueio de correção de unidades, ou null se ainda pode corrigir. '
  'Trava por compromisso assumido (resposta de fornecedor, pedido enviado, NF-e '
  'conferida), não por participação em rodada ou pedido em rascunho.';

commit;
