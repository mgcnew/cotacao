-- 0129_purchase_forms_in_orders.sql
-- Etapa 3 das formas de compra (0127, 0128): o pedido guarda a forma do
-- item, e o pedido direto aceita item em outra forma.
--
-- No pedido a forma é deduzida da unidade: se a unidade de compra do item é a
-- unidade de uma forma do produto, o item está naquela forma. Isso vale para
-- todos os caminhos que gravam item de pedido — alocação da rodada (0013),
-- pedido direto, revisão, rascunho editado (0026), item da nota (0112) —
-- sem reescrever nenhum deles. A dedução é segura porque a unidade de uma
-- forma nunca é a unidade de compra padrão do produto (0127) e uma forma
-- usada não muda mais (0128).
--
-- A equivalência é copiada para o item, como na rodada. Recebimento e nota
-- leem dali para converter "24 un" da nota em "2 cx" do pedido.

begin;

alter table public.order_revision_items
  add column purchase_form_id uuid,
  add column form_unit_quantity numeric(18,6),
  add column form_base_quantity numeric(18,6),
  add constraint order_revision_items_purchase_form_fkey
    foreign key (company_id, purchase_form_id)
    references public.product_purchase_forms(company_id, id) on delete restrict,
  add constraint order_revision_items_purchase_form_quantities_check
    check (
      (purchase_form_id is null
        and form_unit_quantity is null and form_base_quantity is null)
      or (purchase_form_id is not null
        and form_unit_quantity > 0 and form_base_quantity > 0)
    );

create index order_revision_items_purchase_form_idx
on public.order_revision_items(purchase_form_id)
where purchase_form_id is not null;

create or replace function private.fill_order_item_purchase_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.product_purchase_forms%rowtype;
begin
  if new.purchase_form_id is not null then
    select form.* into v_form
    from public.product_purchase_forms form
    where form.company_id = new.company_id
      and form.id = new.purchase_form_id;

    if not found or v_form.product_id <> new.product_id then
      raise exception 'A forma de compra não pertence a este produto';
    end if;
  else
    select form.* into v_form
    from public.product_purchase_forms form
    where form.company_id = new.company_id
      and form.product_id = new.product_id
      and form.unit_id = new.purchase_unit_id;
  end if;

  if v_form.id is null then
    new.purchase_form_id := null;
    new.form_unit_quantity := null;
    new.form_base_quantity := null;
    return new;
  end if;

  -- Compra e preço na forma, comparação na base, como na rodada (0128).
  new.purchase_form_id := v_form.id;
  new.purchase_unit_id := v_form.unit_id;
  new.pricing_unit_id := v_form.unit_id;
  new.comparison_unit_id := v_form.base_unit_id;
  new.form_unit_quantity := v_form.unit_quantity;
  new.form_base_quantity := v_form.base_quantity;
  new.estimated_pricing_quantity := null;
  return new;
end;
$$;

revoke all on function private.fill_order_item_purchase_form()
from public, anon, authenticated;

create trigger order_revision_items_fill_purchase_form
before insert or update of purchase_form_id, product_id, purchase_unit_id
on public.order_revision_items
for each row execute function private.fill_order_item_purchase_form();

-- Pedidos gerados entre a 0128 e esta já levaram a unidade da forma.
update public.order_revision_items item
set purchase_form_id = form.id
from public.product_purchase_forms form
where form.company_id = item.company_id
  and form.product_id = item.product_id
  and form.unit_id = item.purchase_unit_id
  and item.purchase_form_id is null;

-- Forma usada em pedido também fica travada.
create or replace function public.rpc_sync_product_purchase_forms(
  p_company_id uuid,
  p_product_id uuid,
  p_forms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_base uuid;
  v_form jsonb;
  v_unit_id uuid;
  v_unit_quantity numeric;
  v_base_quantity numeric;
  v_seen uuid[] := '{}';
  v_used record;
begin
  perform private.require_permission(p_company_id, 'product.update');

  if jsonb_typeof(coalesce(p_forms, '[]'::jsonb)) <> 'array' then
    raise exception 'Formas de compra inválidas';
  end if;

  select product.*
  into v_product
  from public.products product
  where product.company_id = p_company_id
    and product.id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if v_product.purpose = 'packaging'
     and jsonb_array_length(coalesce(p_forms, '[]'::jsonb)) > 0 then
    raise exception 'Embalagens já comparam pela quantidade que o fornecedor informa em cada cotação, e não usam outras formas de compra';
  end if;

  v_base := coalesce(v_product.comparison_unit_id, v_product.pricing_unit_id);

  for v_form in select value from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb))
  loop
    begin
      v_unit_id := (v_form->>'unitId')::uuid;
      v_unit_quantity := (v_form->>'unitQuantity')::numeric;
      v_base_quantity := (v_form->>'baseQuantity')::numeric;
    exception when others then
      raise exception 'Forma de compra com unidade ou quantidade inválida';
    end;

    if v_unit_id is null then
      raise exception 'Escolha a unidade de cada forma de compra';
    end if;
    if v_unit_quantity is null or v_unit_quantity <= 0
       or v_base_quantity is null or v_base_quantity <= 0 then
      raise exception 'Informe quanto cada forma de compra contém, com números maiores que zero';
    end if;
    if v_unit_id = any(v_seen) then
      raise exception 'A mesma unidade aparece em duas formas de compra';
    end if;
    if v_unit_id = v_base then
      raise exception 'A unidade-base do produto não precisa de forma de compra própria';
    end if;
    if v_unit_id = v_product.purchase_unit_id then
      raise exception 'A unidade de compra do produto já é a forma padrão';
    end if;

    if not exists (
      select 1
      from public.units unit
      where unit.company_id = p_company_id
        and unit.id = v_unit_id
        and (
          unit.is_active
          or exists (
            select 1 from public.product_purchase_forms form
            where form.company_id = p_company_id
              and form.product_id = p_product_id
              and form.unit_id = v_unit_id
          )
        )
    ) then
      raise exception 'Escolha uma unidade ativa desta empresa';
    end if;

    v_seen := v_seen || v_unit_id;
  end loop;

  -- Forma já usada em lista ou rodada não muda nem sai: o número pedido e o
  -- preço cotado foram escritos olhando para ela.
  for v_used in
    select form.id, form.unit_id, form.unit_quantity, form.base_quantity,
           unit.symbol
    from public.product_purchase_forms form
    join public.units unit
      on unit.company_id = form.company_id and unit.id = form.unit_id
    where form.company_id = p_company_id
      and form.product_id = p_product_id
      and (
        exists (
          select 1 from public.shopping_list_items item
          where item.company_id = form.company_id
            and item.purchase_form_id = form.id
        )
        or exists (
          select 1 from public.quotation_items item
          where item.company_id = form.company_id
            and item.purchase_form_id = form.id
        )
        or exists (
          select 1 from public.order_revision_items item
          where item.company_id = form.company_id
            and item.purchase_form_id = form.id
        )
      )
  loop
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb)) wanted
      where (wanted->>'unitId')::uuid = v_used.unit_id
        and (wanted->>'unitQuantity')::numeric = v_used.unit_quantity
        and (wanted->>'baseQuantity')::numeric = v_used.base_quantity
    ) or exists (
      select 1 from public.product_purchase_forms form
      where form.id = v_used.id and form.base_unit_id <> v_base
    ) then
      raise exception 'A forma % já foi usada em lista, rodada ou pedido e não pode mais ser alterada nem removida', v_used.symbol;
    end if;
  end loop;

  for v_form in select value from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb))
  loop
    insert into public.product_purchase_forms (
      company_id, product_id, unit_id, unit_quantity, base_quantity,
      base_unit_id, created_by
    )
    values (
      p_company_id, p_product_id, (v_form->>'unitId')::uuid,
      (v_form->>'unitQuantity')::numeric, (v_form->>'baseQuantity')::numeric,
      v_base, auth.uid()
    )
    on conflict (company_id, product_id, unit_id) do update
    set unit_quantity = excluded.unit_quantity,
        base_quantity = excluded.base_quantity,
        base_unit_id = excluded.base_unit_id
    where (
      product_purchase_forms.unit_quantity,
      product_purchase_forms.base_quantity,
      product_purchase_forms.base_unit_id
    ) is distinct from (
      excluded.unit_quantity,
      excluded.base_quantity,
      excluded.base_unit_id
    );
  end loop;

  delete from public.product_purchase_forms form
  where form.company_id = p_company_id
    and form.product_id = p_product_id
    and not (form.unit_id = any(v_seen));

  return jsonb_build_object('forms', cardinality(v_seen));
end;
$$;


revoke all on function public.rpc_sync_product_purchase_forms(uuid, uuid, jsonb)
from public, anon;
grant execute on function public.rpc_sync_product_purchase_forms(uuid, uuid, jsonb)
to authenticated;

-- Volta a ser a da 0042: a recusa de item em outra forma (0128) sai, porque
-- agora o pedido leva a unidade da forma.
create or replace function public.rpc_create_direct_order_from_shopping_list(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_shopping_item_ids uuid[],
  p_delivery_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  v_result := public.rpc_create_direct_order(
    p_company_id, p_supplier_id, p_items, p_delivery_due_date
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  update public.shopping_list_items sli
  set status = 'imported', imported_to_type = 'order',
      imported_to_id = v_order_id, imported_at = now()
  where sli.company_id = p_company_id
    and sli.id = any(p_shopping_item_ids)
    and sli.status = 'pending'
    and exists (
      select 1 from jsonb_array_elements(p_items) item
      where (item ->> 'product_id')::uuid = sli.product_id
    );

  return v_result;
end;
$$;


revoke all on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  from public, anon;
grant execute on function public.rpc_create_direct_order_from_shopping_list(uuid, uuid, jsonb, uuid[], date)
  to authenticated;

commit;
