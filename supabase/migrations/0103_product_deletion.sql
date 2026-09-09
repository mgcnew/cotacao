-- 0103_product_deletion.sql
-- Exclusão de produto quando não há história, com a mesma leitura de 0102:
-- compromisso assumido é definitivo, referência viva só precisa ser desfeita.
--
-- Três estados:
--   free       -> nada de história aponta para o produto. Exclui, e os satélites
--                 (atributos, códigos de barras, vínculo com fornecedor, aliases
--                 e regras de NF-e, sugestões) somem junto pelo cascade que já
--                 existe desde 0003/0006/0042/0066/0076/0080.
--   removable  -> ainda referenciado em trabalho vivo ou em configuração: rodada
--                 sem resposta, pedido em rascunho, lista de compras aberta,
--                 calendário de demanda, agenda de fornecedor, importação de
--                 NF-e não concluída. Desfaça de lá e a exclusão libera.
--   historical -> resposta de fornecedor, pedido enviado ou NF-e conferida.
--                 Só inativar.
--
-- A avaliação cobre TODAS as FKs `on delete restrict` que apontam para products.
-- É isso que garante que o preview nunca prometa uma exclusão que o banco vá
-- recusar depois com erro cru de constraint.

begin;

-- ---------------------------------------------------------------------------
-- Permissão
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, action, description)
values ('product.delete', 'product', 'delete', 'Excluir produtos sem histórico')
on conflict (key) do nothing;

-- Empresas novas já recebem tudo: em rpc_provision_company o Administrador leva
-- `select ... from public.permissions` inteiro. Este insert é o mesmo efeito para
-- as empresas que já existem. Comprador fica de fora de propósito — exclusão é
-- destrutiva e pode ser concedida caso a caso pela tela de papéis.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.name = 'Administrador'
  and role.is_system
  and permission.key = 'product.delete'
on conflict do nothing;

-- A trava de unidades e a avaliação de exclusão consultam shopping_list_items
-- por produto; os índices existentes começam por status/origin e não servem.
create index if not exists shopping_list_items_company_product_idx
on public.shopping_list_items(company_id, product_id);

-- ---------------------------------------------------------------------------
-- Avaliação
-- ---------------------------------------------------------------------------

create or replace function private.product_delete_assessment(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_detail text;
begin
  -- ---- história: só inativar --------------------------------------------

  -- Mesma leitura de 0102: o fornecedor declarou preço, disponibilidade ou
  -- recusa. O produto virou parte de uma conversa comercial.
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
    return jsonb_build_object(
      'kind', 'historical',
      'canDelete', false,
      'reason', 'Este produto já recebeu resposta de fornecedor em cotação. O histórico de preço depende dele, então só é possível inativar.'
    );
  end if;

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
    return jsonb_build_object(
      'kind', 'historical',
      'canDelete', false,
      'reason', 'Este produto já foi enviado em um pedido a fornecedor. Só é possível inativar.'
    );
  end if;

  if exists (
    select 1
    from public.historical_nfe_items item
    join public.historical_nfe_imports import
      on import.company_id = item.company_id
     and import.id = item.import_id
     and import.status = 'posted'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.reconciliation_status = 'matched'
  ) then
    return jsonb_build_object(
      'kind', 'historical',
      'canDelete', false,
      'reason', 'Este produto possui histórico fiscal confirmado. Só é possível inativar.'
    );
  end if;

  -- ---- referência viva: desfaça e volte ----------------------------------

  -- Chegou aqui: nenhum fornecedor respondeu sobre ele. Se ainda está numa
  -- rodada, é lista montada que dá para editar.
  -- A existência do item é que decide; o título da rodada é só para a mensagem.
  -- Separar os dois evita que um join sem correspondência faça a função dizer
  -- "pode excluir" sobre uma linha que o banco vai recusar.
  if exists (
    select 1
    from public.quotation_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    select round.title
    into v_detail
    from public.quotation_items item
    join public.purchase_rounds round
      on round.company_id = item.company_id
     and round.id = item.purchase_round_id
    where item.company_id = p_company_id
      and item.product_id = p_product_id
    order by round.created_at desc
    limit 1;

    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', case
        when v_detail is null
          then 'Este produto está em uma rodada que ainda não recebeu resposta sobre ele. Remova-o da rodada para poder excluir.'
        else format(
          'Este produto está na rodada "%s", que ainda não recebeu resposta sobre ele. Remova-o da rodada para poder excluir.',
          v_detail
        )
      end
    );
  end if;

  -- Revisão em rascunho ou cancelada: o pedido não saiu.
  if exists (
    select 1
    from public.order_revision_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', 'Este produto está em um pedido que ainda não foi enviado. Remova-o do pedido para poder excluir.'
    );
  end if;

  if exists (
    select 1
    from public.shopping_list_items item
    join public.shopping_lists list
      on list.company_id = item.company_id
     and list.id = item.shopping_list_id
     and list.status = 'open'
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', 'Este produto está na lista de compras aberta. Remova-o da lista para poder excluir.'
    );
  end if;

  if exists (
    select 1
    from public.supplier_purchase_schedule_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    select supplier.name
    into v_detail
    from public.supplier_purchase_schedule_items item
    join public.supplier_purchase_schedules schedule
      on schedule.company_id = item.company_id
     and schedule.id = item.schedule_id
    join public.suppliers supplier
      on supplier.company_id = schedule.company_id
     and supplier.id = schedule.supplier_id
    where item.company_id = p_company_id
      and item.product_id = p_product_id
    limit 1;

    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', case
        when v_detail is null
          then 'Este produto faz parte da agenda de compra de um fornecedor. Remova-o da agenda para poder excluir.'
        else format(
          'Este produto faz parte da agenda de compra de %s. Remova-o da agenda para poder excluir.',
          v_detail
        )
      end
    );
  end if;

  select event.name
  into v_detail
  from public.demand_calendar_events event
  where event.company_id = p_company_id
    and event.product_id = p_product_id
  limit 1;

  if found then
    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', format(
        'Este produto está no evento "%s" do calendário de demanda. Ajuste o evento para poder excluir.',
        v_detail
      )
    );
  end if;

  -- Sobra a NF-e histórica que ainda não foi conferida: importação em rascunho,
  -- anulada, ou linha pendente/ignorada. Desfazer é trabalho da tela fiscal.
  if exists (
    select 1
    from public.historical_nfe_items item
    where item.company_id = p_company_id
      and item.product_id = p_product_id
  ) then
    return jsonb_build_object(
      'kind', 'removable',
      'canDelete', false,
      'reason', 'Este produto está vinculado a uma nota fiscal ainda não concluída. Desfaça o vínculo na importação para poder excluir.'
    );
  end if;

  return jsonb_build_object('kind', 'free', 'canDelete', true, 'reason', null);
end;
$$;

comment on function private.product_delete_assessment(uuid, uuid) is
  'Diz se o produto pode ser excluído: free, removable (referência viva, desfaça '
  'antes) ou historical (só inativar). Cobre todas as FKs restrict de products.';

revoke all on function private.product_delete_assessment(uuid, uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preview para a confirmação
-- ---------------------------------------------------------------------------

create or replace function public.rpc_product_delete_preview(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assessment jsonb;
begin
  perform private.require_permission(p_company_id, 'product.view');

  if not exists (
    select 1
    from public.products product
    where product.company_id = p_company_id
      and product.id = p_product_id
  ) then
    raise exception 'Produto não encontrado';
  end if;

  v_assessment := private.product_delete_assessment(p_company_id, p_product_id);

  -- O que vai junto. Quem confirma a exclusão precisa ver isto antes: são dados
  -- que a pessoa cadastrou à mão e que não voltam.
  return v_assessment || jsonb_build_object(
    'collateral', jsonb_build_object(
      'barcodes', (
        select count(*) from public.product_barcodes item
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'supplierLinks', (
        select count(*) from public.supplier_products item
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'nfeAliases', (
        select count(*) from public.supplier_product_aliases item
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'nfeUnitRules', (
        select count(*) from public.supplier_product_nfe_unit_rules item
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'attributes', (
        select count(*) from public.product_attribute_values item
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'archivedListItems', (
        select count(*)
        from public.shopping_list_items item
        join public.shopping_lists list
          on list.company_id = item.company_id
         and list.id = item.shopping_list_id
         and list.status = 'archived'
        where item.company_id = p_company_id and item.product_id = p_product_id
      ),
      'importReferences', (
        select count(*)
        from public.product_import_items item
        where item.company_id = p_company_id
          and (
            item.duplicate_product_id = p_product_id
            or item.imported_product_id = p_product_id
          )
      )
    )
  );
end;
$$;

revoke all on function public.rpc_product_delete_preview(uuid, uuid)
from public, anon;
grant execute on function public.rpc_product_delete_preview(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Exclusão
-- ---------------------------------------------------------------------------

create or replace function public.rpc_delete_product(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_assessment jsonb;
begin
  perform private.require_permission(p_company_id, 'product.delete');

  select product.*
  into v_product
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  -- Reavaliação dentro do lock. O preview que a tela viu pode ter envelhecido
  -- entre a leitura e o clique — outra pessoa pode ter posto o produto numa
  -- rodada nesse intervalo.
  v_assessment := private.product_delete_assessment(p_company_id, p_product_id);

  if not (v_assessment ->> 'canDelete')::boolean then
    raise exception '%', v_assessment ->> 'reason';
  end if;

  -- Duas referências `restrict` que a avaliação classifica como livres porque
  -- são desfeitas aqui, não pelo usuário:

  -- 1. Rascunho de importação. O lote continua existindo como registro do que
  --    foi processado; só perde o ponteiro para um produto que deixou de haver.
  --    A FK é composta, então `on delete set null` anularia company_id junto —
  --    por isso o null é dado aqui e a FK segue restrict.
  update public.product_import_items
  set duplicate_product_id = null
  where company_id = p_company_id
    and duplicate_product_id = p_product_id;

  update public.product_import_items
  set imported_product_id = null
  where company_id = p_company_id
    and imported_product_id = p_product_id;

  -- 2. Item de lista de compras arquivada. O que a lista virou (rodada ou
  --    pedido) já foi barrado acima se tinha história; o que sobra é pedido
  --    operacional antigo, e é o que mais entope o cadastro.
  delete from public.shopping_list_items item
  using public.shopping_lists list
  where item.company_id = p_company_id
    and item.product_id = p_product_id
    and list.company_id = item.company_id
    and list.id = item.shopping_list_id
    and list.status = 'archived';

  -- Os satélites (atributos, códigos de barras, supplier_products, aliases e
  -- regras de NF-e, sugestões) saem por cascade. Qualquer FK restrict que esta
  -- função não tenha previsto aborta a transação aqui, que é o comportamento
  -- correto: melhor recusar do que apagar história pela metade.
  delete from public.products
  where company_id = p_company_id
    and id = p_product_id;

  return jsonb_build_object('deleted', true, 'name', v_product.name);
end;
$$;

comment on function public.rpc_delete_product(uuid, uuid) is
  'Exclui produto sem história. Recusa com motivo legível quando ainda há '
  'referência viva (desfaça antes) ou compromisso comercial (só inativar).';

revoke all on function public.rpc_delete_product(uuid, uuid)
from public, anon;
grant execute on function public.rpc_delete_product(uuid, uuid)
to authenticated;

commit;
