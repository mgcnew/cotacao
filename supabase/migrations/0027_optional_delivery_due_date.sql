-- 0027_optional_delivery_due_date.sql
--
-- APLICADA em 2026-08-16.
--
-- PROBLEMA
-- `rpc_create_direct_order` e `rpc_create_order_revision` (0013) declaram
-- `p_delivery_due_date date` sem default. Em SQL isso nao impede passar null,
-- mas o gerador de tipos do Supabase le a ausencia de default como parametro
-- obrigatorio e nao nulo -- e o app, que tipa toda chamada de RPC pelo
-- Database gerado, fica sem como dizer "sem prazo definido".
--
-- Todo o resto do schema segue a convencao oposta: parametro opcional leva
-- `default null`. `rpc_confirm_allocations_generate_orders`, que gera pedidos
-- pelo mesmo caminho, tem o default -- e por isso o app ja conseguia confirmar
-- uma compra sem prazo. Estas duas eram a excecao.
--
-- Prazo de entrega e mesmo opcional no dominio: compra fechada sem data
-- combinada existe, e exigir uma data inventaria informacao que ninguem
-- acordou com o fornecedor.
--
-- SOLUCAO
-- O default vai para `p_delivery_due_date`, que por isso precisa ser o ultimo
-- parametro -- em SQL, parametro com default nao pode preceder parametro sem.
-- Mudar a ordem muda a assinatura, entao e drop + create em vez de replace.
--
-- O drop e seguro: nenhuma outra funcao, view ou trigger chama estas duas.
-- Quem chama e o app, e o PostgREST chama por NOME de parametro -- a ordem nao
-- o afeta. Os grants sao refeitos logo abaixo, incluindo o revoke de anon que
-- a 0018 tinha aplicado sobre a assinatura antiga.
--
-- Os corpos sao copia literal da 0013. A unica diferenca esta na assinatura.
--
-- VERIFICADO apos aplicar, com JWT real e rollback:
--   pedido direto sem prazo        criado, delivery_due_date null
--   pedido direto com prazo        criado, delivery_due_date gravada
--   grants                         authenticated executa, anon nao
--   assinatura antiga              nao existe mais (sem funcao duplicada)

begin;

drop function if exists public.rpc_create_direct_order(uuid, uuid, date, jsonb);
drop function if exists public.rpc_create_order_revision(uuid, uuid, date, jsonb);

create or replace function public.rpc_create_direct_order(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_revision_id uuid;
  v_item jsonb;
  v_product record;
  v_requested numeric(18,6);
  v_agreed numeric(18,6);
begin
  perform private.require_permission(p_company_id, 'order.create');

  if not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id
      and s.company_id = p_company_id
      and s.status = 'active'
  ) then
    raise exception 'Fornecedor inválido ou inativo';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido deve possuir ao menos um item';
  end if;

  insert into public.orders (
    company_id, supplier_id, origin, status, created_by
  )
  values (
    p_company_id, p_supplier_id, 'direct', 'draft', auth.uid()
  )
  returning id into v_order_id;

  insert into public.order_revisions (
    company_id, order_id, revision_number, status, delivery_due_date, created_by
  )
  values (
    p_company_id, v_order_id, 1, 'draft', p_delivery_due_date, auth.uid()
  )
  returning id into v_revision_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := nullif(v_item ->> 'requested_quantity', '')::numeric;
    v_agreed := nullif(v_item ->> 'agreed_price', '')::numeric;

    if v_requested is null or v_requested <= 0
       or v_agreed is null or v_agreed < 0 then
      raise exception 'Quantidade ou preço inválido em pedido direto';
    end if;

    select p.id, p.name
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.company_id = p_company_id
      and p.is_active = true;

    if v_product.id is null then
      raise exception 'Produto inválido no pedido direto';
    end if;

    -- As FKs compostas validarão unidades contra a empresa.
    insert into public.order_revision_items (
      company_id,
      order_revision_id,
      purchase_allocation_id,
      product_id,
      product_name_snapshot,
      requested_quantity,
      purchase_unit_id,
      pricing_unit_id,
      comparison_unit_id,
      estimated_pricing_quantity,
      agreed_price,
      notes
    )
    values (
      p_company_id,
      v_revision_id,
      null,
      v_product.id,
      v_product.name,
      v_requested,
      (v_item ->> 'purchase_unit_id')::uuid,
      (v_item ->> 'pricing_unit_id')::uuid,
      nullif(v_item ->> 'comparison_unit_id', '')::uuid,
      nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
      v_agreed,
      nullif(v_item ->> 'notes', '')
    );
  end loop;

  update public.orders
  set current_revision_id = v_revision_id
  where id = v_order_id and company_id = p_company_id;

  perform private.emit_domain_event(
    p_company_id,
    'order.created',
    'order',
    v_order_id,
    jsonb_build_object(
      'origin', 'direct',
      'order_revision_id', v_revision_id,
      'supplier_id', p_supplier_id
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_revision_id', v_revision_id
  );
end;
$$;

create or replace function public.rpc_create_order_revision(
  p_company_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision_number integer;
  v_revision_id uuid;
  v_item jsonb;
  v_product record;
  v_requested numeric(18,6);
  v_agreed numeric(18,6);
begin
  perform private.require_permission(p_company_id, 'order.revise');

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.company_id = p_company_id
      and o.status not in ('received','cancelled')
  ) then
    raise exception 'Pedido inexistente ou não permite revisão';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Revisão deve possuir ao menos um item';
  end if;

  if exists (
    select 1
    from public.order_revisions r
    where r.order_id = p_order_id
      and r.company_id = p_company_id
      and r.status = 'draft'
  ) then
    raise exception 'Já existe uma revisão em rascunho para este pedido';
  end if;

  select coalesce(max(r.revision_number), 0) + 1
  into v_revision_number
  from public.order_revisions r
  where r.order_id = p_order_id
    and r.company_id = p_company_id;

  insert into public.order_revisions (
    company_id,
    order_id,
    revision_number,
    status,
    delivery_due_date,
    created_by
  )
  values (
    p_company_id,
    p_order_id,
    v_revision_number,
    'draft',
    p_delivery_due_date,
    auth.uid()
  )
  returning id into v_revision_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := nullif(v_item ->> 'requested_quantity', '')::numeric;
    v_agreed := nullif(v_item ->> 'agreed_price', '')::numeric;

    if v_requested is null or v_requested <= 0
       or v_agreed is null or v_agreed < 0 then
      raise exception 'Quantidade ou preço inválido na revisão';
    end if;

    select p.id, p.name
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.company_id = p_company_id;

    if v_product.id is null then
      raise exception 'Produto inválido na revisão';
    end if;

    insert into public.order_revision_items (
      company_id,
      order_revision_id,
      purchase_allocation_id,
      product_id,
      product_name_snapshot,
      requested_quantity,
      purchase_unit_id,
      pricing_unit_id,
      comparison_unit_id,
      estimated_pricing_quantity,
      agreed_price,
      notes
    )
    values (
      p_company_id,
      v_revision_id,
      nullif(v_item ->> 'purchase_allocation_id', '')::uuid,
      v_product.id,
      v_product.name,
      v_requested,
      (v_item ->> 'purchase_unit_id')::uuid,
      (v_item ->> 'pricing_unit_id')::uuid,
      nullif(v_item ->> 'comparison_unit_id', '')::uuid,
      nullif(v_item ->> 'estimated_pricing_quantity', '')::numeric,
      v_agreed,
      nullif(v_item ->> 'notes', '')
    );
  end loop;

  perform private.emit_domain_event(
    p_company_id,
    'order.revision_created',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_revision_id', v_revision_id,
      'revision_number', v_revision_number
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_revision_id', v_revision_id,
    'revision_number', v_revision_number
  );
end;
$$;

revoke all on function public.rpc_create_direct_order(uuid, uuid, jsonb, date)
  from public, anon;
grant execute on function public.rpc_create_direct_order(uuid, uuid, jsonb, date)
  to authenticated;

revoke all on function public.rpc_create_order_revision(uuid, uuid, jsonb, date)
  from public, anon;
grant execute on function public.rpc_create_order_revision(uuid, uuid, jsonb, date)
  to authenticated;

commit;
