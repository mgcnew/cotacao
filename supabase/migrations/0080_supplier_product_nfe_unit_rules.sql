-- Aprende como a unidade usada por um fornecedor na NF-e deve ser convertida.

begin;

create table public.supplier_product_nfe_unit_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  product_id uuid not null,
  xml_unit text not null
    check (char_length(btrim(xml_unit)) between 1 and 30),
  target_unit_id uuid not null,
  mode text not null check (mode in ('fixed_factor', 'manual_quantity')),
  factor numeric(18,6),
  source text not null default 'nfe' check (source in ('nfe', 'manual')),
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, supplier_id, product_id, xml_unit, target_unit_id),
  foreign key (company_id, supplier_id)
    references public.suppliers(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade,
  foreign key (company_id, target_unit_id)
    references public.units(company_id, id) on delete cascade,
  check (
    (mode = 'fixed_factor' and factor is not null and factor > 0)
    or (mode = 'manual_quantity' and factor is null)
  )
);

create index supplier_product_nfe_unit_rules_lookup_idx
on public.supplier_product_nfe_unit_rules(company_id, supplier_id, product_id);

create trigger supplier_product_nfe_unit_rules_set_updated_at
before update on public.supplier_product_nfe_unit_rules
for each row execute function private.set_updated_at();

alter table public.supplier_product_nfe_unit_rules enable row level security;
revoke all on public.supplier_product_nfe_unit_rules from anon;
grant select on public.supplier_product_nfe_unit_rules to authenticated;

create policy supplier_product_nfe_unit_rules_select_member
on public.supplier_product_nfe_unit_rules for select to authenticated
using ((select private.is_company_member(company_id)));

create or replace function public.rpc_save_supplier_product_nfe_unit_rule(
  p_company_id uuid,
  p_receipt_id uuid,
  p_order_revision_item_id uuid,
  p_xml_unit text,
  p_target_kind text,
  p_mode text,
  p_factor numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_revision_id uuid;
  v_product_id uuid;
  v_purchase_unit_id uuid;
  v_pricing_unit_id uuid;
  v_target_unit_id uuid;
  v_rule_id uuid;
  v_xml_unit text := pg_catalog.upper(nullif(pg_catalog.btrim(p_xml_unit), ''));
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if v_xml_unit is null or char_length(v_xml_unit) > 30 then
    raise exception 'Unidade da NF-e inválida';
  end if;
  if p_target_kind not in ('purchase', 'pricing') then
    raise exception 'Destino da conversão inválido';
  end if;
  if p_mode not in ('fixed_factor', 'manual_quantity') then
    raise exception 'Tipo de conversão inválido';
  end if;
  if (p_mode = 'fixed_factor' and (p_factor is null or p_factor <= 0))
     or (p_mode = 'manual_quantity' and p_factor is not null) then
    raise exception 'Fator de conversão inválido';
  end if;
  if p_mode = 'manual_quantity' and p_target_kind <> 'purchase' then
    raise exception 'Confirmação manual só pode definir a quantidade física';
  end if;

  select o.supplier_id, o.current_revision_id
  into v_supplier_id, v_revision_id
  from public.receipts r
  join public.orders o
    on o.company_id = r.company_id and o.id = r.order_id
  where r.company_id = p_company_id
    and r.id = p_receipt_id
    and r.status = 'draft'
  for update of r;

  if v_supplier_id is null or v_revision_id is null then
    raise exception 'Recebimento não encontrado ou já conferido';
  end if;

  select ori.product_id, ori.purchase_unit_id, ori.pricing_unit_id
  into v_product_id, v_purchase_unit_id, v_pricing_unit_id
  from public.order_revision_items ori
  where ori.company_id = p_company_id
    and ori.order_revision_id = v_revision_id
    and ori.id = p_order_revision_item_id;

  if v_product_id is null then
    raise exception 'Produto não pertence ao pedido deste recebimento';
  end if;

  v_target_unit_id := case when p_target_kind = 'purchase'
    then v_purchase_unit_id else v_pricing_unit_id end;
  if p_mode = 'manual_quantity'
     and v_purchase_unit_id = v_pricing_unit_id then
    raise exception 'Peso variável exige unidades de compra e preço diferentes';
  end if;

  insert into public.supplier_product_nfe_unit_rules (
    company_id, supplier_id, product_id, xml_unit, target_unit_id,
    mode, factor, source, created_by
  ) values (
    p_company_id, v_supplier_id, v_product_id, v_xml_unit, v_target_unit_id,
    p_mode, p_factor, 'nfe', auth.uid()
  )
  on conflict (company_id, supplier_id, product_id, xml_unit, target_unit_id)
  do update set
    mode = excluded.mode,
    factor = excluded.factor,
    source = 'nfe',
    last_used_at = now(),
    updated_at = now()
  returning id into v_rule_id;

  return v_rule_id;
end;
$$;

revoke all on function public.rpc_save_supplier_product_nfe_unit_rule(
  uuid, uuid, uuid, text, text, text, numeric
) from public, anon;
grant execute on function public.rpc_save_supplier_product_nfe_unit_rule(
  uuid, uuid, uuid, text, text, text, numeric
) to authenticated;

commit;
