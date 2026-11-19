begin;

create table public.price_research_routines (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  name text not null check(char_length(name) between 3 and 120),
  weekdays integer[] not null default array[1,4] check(cardinality(weekdays)>0 and weekdays <@ array[0,1,2,3,4,5,6]),
  starts_on date not null default current_date, is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(company_id,id)
);
create table public.price_research_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  routine_id uuid not null, product_id uuid not null,
  quantity numeric not null default 1 check(quantity>0),
  unique(routine_id,product_id),
  foreign key(company_id,routine_id) references public.price_research_routines(company_id,id) on delete cascade,
  foreign key(company_id,product_id) references public.products(company_id,id)
);
create table public.price_research_suppliers (
  company_id uuid not null, routine_id uuid not null, supplier_id uuid not null,
  primary key(routine_id,supplier_id),
  foreign key(company_id,routine_id) references public.price_research_routines(company_id,id) on delete cascade,
  foreign key(company_id,supplier_id) references public.suppliers(company_id,id)
);
alter table public.purchase_rounds
  add column price_research_routine_id uuid,
  add column price_research_date date,
  add constraint purchase_rounds_research_fk foreign key(company_id,price_research_routine_id)
    references public.price_research_routines(company_id,id),
  add constraint purchase_rounds_research_pair check((price_research_routine_id is null)=(price_research_date is null));
create unique index purchase_rounds_research_occurrence_idx
  on public.purchase_rounds(company_id,price_research_routine_id,price_research_date)
  where price_research_routine_id is not null and status <> 'cancelled';

create table public.price_research_snapshots (
  company_id uuid not null, round_id uuid not null, captured_at timestamptz not null default now(),
  data jsonb not null, primary key(company_id,round_id),
  foreign key(company_id,round_id) references public.purchase_rounds(company_id,id)
);

alter table public.price_research_routines enable row level security;
alter table public.price_research_items enable row level security;
alter table public.price_research_suppliers enable row level security;
alter table public.price_research_snapshots enable row level security;
grant select,insert,update,delete on public.price_research_routines,public.price_research_items,public.price_research_suppliers to authenticated;
grant select on public.price_research_snapshots to authenticated;
revoke all on public.price_research_routines,public.price_research_items,public.price_research_suppliers,public.price_research_snapshots from anon;
create policy research_read on public.price_research_routines for select to authenticated using(private.has_permission(company_id,'purchase_round.view'));
create policy research_write on public.price_research_routines for all to authenticated
  using(private.has_permission(company_id,'purchase_round.update')) with check(private.has_permission(company_id,'purchase_round.update'));
create policy research_items_read on public.price_research_items for select to authenticated using(private.has_permission(company_id,'purchase_round.view'));
create policy research_items_write on public.price_research_items for all to authenticated
  using(private.has_permission(company_id,'purchase_round.update')) with check(private.has_permission(company_id,'purchase_round.update'));
create policy research_suppliers_read on public.price_research_suppliers for select to authenticated using(private.has_permission(company_id,'purchase_round.view'));
create policy research_suppliers_write on public.price_research_suppliers for all to authenticated
  using(private.has_permission(company_id,'purchase_round.update')) with check(private.has_permission(company_id,'purchase_round.update'));
create policy research_snapshot_read on public.price_research_snapshots for select to authenticated
  using(private.has_permission(company_id,'purchase_round.view') and private.has_permission(company_id,'quotation_response.view'));

create function private.guard_price_research_origin()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.price_research_routine_id is distinct from old.price_research_routine_id
    or new.price_research_date is distinct from old.price_research_date then
    raise exception 'A rotina e a data de origem da coleta são imutáveis';
  end if;
  return new;
end; $$;
revoke all on function private.guard_price_research_origin() from public,anon,authenticated;
create trigger guard_price_research_origin before update on public.purchase_rounds
  for each row execute function private.guard_price_research_origin();

create function public.rpc_create_price_research_collection(p_company_id uuid,p_routine_id uuid,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_routine public.price_research_routines; v_round uuid; v_group uuid; v_supplier record; v_contact uuid;
begin
  perform private.require_permission(p_company_id,'purchase_round.create');
  perform private.require_permission(p_company_id,'purchase_round.update');
  perform private.require_permission(p_company_id,'purchase_round.view');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text||p_routine_id::text||p_date::text,0));
  select * into v_routine from public.price_research_routines where company_id=p_company_id and id=p_routine_id;
  if v_routine.id is null then raise exception 'Rotina não encontrada'; end if;
  select id into v_round from public.purchase_rounds where company_id=p_company_id
    and price_research_routine_id=p_routine_id and price_research_date=p_date and status<>'cancelled';
  if v_round is not null then return v_round; end if;
  if not v_routine.is_active then raise exception 'Rotina pausada'; end if;
  if p_date is null or p_date<v_routine.starts_on or not(extract(dow from p_date)::integer=any(v_routine.weekdays)) then
    raise exception 'Escolha uma data prevista nos dias da rotina'; end if;
  if not exists(select 1 from public.price_research_items i join public.products p on p.company_id=i.company_id and p.id=i.product_id and p.is_active where i.company_id=p_company_id and i.routine_id=p_routine_id) then
    raise exception 'Adicione produtos ativos à rotina'; end if;
  if not exists(select 1 from public.price_research_suppliers where company_id=p_company_id and routine_id=p_routine_id) then raise exception 'Adicione fornecedores à rotina'; end if;
  insert into public.purchase_rounds(company_id,title,created_by,price_research_routine_id,price_research_date)
    values(p_company_id,v_routine.name||' · '||to_char(p_date,'DD/MM/YYYY'),auth.uid(),p_routine_id,p_date) returning id into v_round;
  insert into public.purchase_round_groups(company_id,purchase_round_id,name) values(p_company_id,v_round,'Pesquisa de preços') returning id into v_group;
  insert into public.quotation_items(company_id,purchase_round_id,group_id,product_id,requested_quantity,purchase_unit_id,pricing_unit_id,comparison_unit_id)
    select p_company_id,v_round,v_group,p.id,i.quantity,p.purchase_unit_id,p.pricing_unit_id,p.comparison_unit_id
    from public.price_research_items i join public.products p on p.company_id=i.company_id and p.id=i.product_id and p.is_active
    where i.company_id=p_company_id and i.routine_id=p_routine_id;
  for v_supplier in select s.id,s.name,s.status from public.price_research_suppliers configured
    join public.suppliers s on s.company_id=configured.company_id and s.id=configured.supplier_id
    where configured.company_id=p_company_id and configured.routine_id=p_routine_id
  loop
    if v_supplier.status<>'active' then raise exception 'Fornecedor % está inativo. Revise a rotina.',v_supplier.name; end if;
    select id into v_contact from public.supplier_contacts where company_id=p_company_id and supplier_id=v_supplier.id and is_active
      order by is_primary desc,id limit 1;
    if v_contact is null then raise exception 'Cadastre um contato ativo para %',v_supplier.name; end if;
    perform public.rpc_upsert_round_supplier_groups(p_company_id,v_round,v_supplier.id,v_contact,array[v_group]);
  end loop;
  return v_round;
end; $$;
revoke all on function public.rpc_create_price_research_collection(uuid,uuid,date) from public;
grant execute on function public.rpc_create_price_research_collection(uuid,uuid,date) to authenticated;

-- Mesma base para a prévia e para o retrato congelado no fechamento.
create function private.price_research_prices(p_company_id uuid,p_round_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
with items as (
  select qi.*, p.name,p.purpose,
    def.id as factor_definition_id,
    (qi.purchase_form_id is not null or (qi.comparison_unit_id is not null and qi.pricing_unit_id<>qi.comparison_unit_id)
      or (p.purpose='packaging' and qi.purchase_unit_id<>qi.pricing_unit_id and qi.comparison_unit_id is null and def.unit_id=qi.pricing_unit_id)) as needs_factor,
    case when qi.purchase_form_id is not null then qi.comparison_unit_id
      when p.purpose='packaging' and qi.purchase_unit_id<>qi.pricing_unit_id and qi.comparison_unit_id is null and def.unit_id=qi.pricing_unit_id then def.unit_id
      else coalesce(qi.comparison_unit_id,qi.pricing_unit_id) end as base_unit_id
  from public.quotation_items qi join public.products p on p.company_id=qi.company_id and p.id=qi.product_id
  left join lateral(select d.id,d.unit_id from public.product_attribute_definitions d
    where d.company_id=qi.company_id and d.is_active and d.is_conversion_factor and(d.product_id=qi.product_id or d.category_id=p.category_id)
    order by(d.product_id=qi.product_id) desc nulls last,d.sort_order,d.id limit 1) def on true
  where qi.company_id=p_company_id and qi.purchase_round_id=p_round_id and qi.commercial_status<>'cancelled'
), offers as (
  select qi.id as item_id,supplier.name as supplier_name,rs.supplier_id,
    price.current_price as price,unit.symbol as pricing_unit,
    case when answer.does_not_supply then 'does_not_supply' when answer.is_available is false then 'unavailable'
      when answer.id is null or price.current_price is null then 'no_response' else 'priced' end as availability,
    case when answer.does_not_supply or answer.is_available is false or price.current_price is null or qi.base_unit_id is null then null
      when coalesce(qi.needs_factor,false) then price.current_price/nullif(case when qi.purchase_form_id is not null then coalesce(answer.form_base_per_unit,qi.form_base_quantity/nullif(qi.form_unit_quantity,0)) else factor.value_numeric end,0)
      else price.current_price end as comparable_price
  from items qi join public.supplier_quotation_items link on link.company_id=qi.company_id and link.quotation_item_id=qi.id and link.removed_at is null
  join public.round_suppliers rs on rs.company_id=link.company_id and rs.id=link.round_supplier_id and rs.removed_at is null
  join public.suppliers supplier on supplier.company_id=rs.company_id and supplier.id=rs.supplier_id
  join public.units unit on unit.company_id=qi.company_id and unit.id=qi.pricing_unit_id
  left join public.quotation_response_items answer on answer.company_id=link.company_id and answer.supplier_quotation_item_id=link.id
  left join public.v_current_response_prices price on price.company_id=answer.company_id and price.quotation_response_item_id=answer.id
  left join public.quotation_response_attribute_values factor on factor.company_id=answer.company_id and factor.quotation_response_item_id=answer.id
    and factor.attribute_definition_id=qi.factor_definition_id and factor.value_numeric>0
)
select coalesce(jsonb_agg(jsonb_build_object(
 'item_id',qi.id,'product_id',qi.product_id,'product_name',qi.name,'unit_id',qi.base_unit_id,'unit',unit.symbol,
 'best_price',(select min(o.comparable_price) from offers o where o.item_id=qi.id and o.comparable_price>=0),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('supplier_id',o.supplier_id,'supplier_name',o.supplier_name,
   'price',o.price,'pricing_unit',o.pricing_unit,'comparable_price',o.comparable_price,'availability',o.availability) order by o.supplier_name)
   from offers o where o.item_id=qi.id),'[]'::jsonb)
) order by qi.name,qi.id),'[]'::jsonb)
from items qi left join public.units unit on unit.company_id=qi.company_id and unit.id=qi.base_unit_id;
$$;
revoke all on function private.price_research_prices(uuid,uuid) from public,anon,authenticated;

create function private.capture_price_research_prices()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.price_research_routine_id is not null and new.status='completed' and old.status is distinct from 'completed' then
    insert into public.price_research_snapshots(company_id,round_id,data)
      values(new.company_id,new.id,private.price_research_prices(new.company_id,new.id)) on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.capture_price_research_prices() from public,anon,authenticated;
create trigger capture_price_research_prices after update on public.purchase_rounds for each row execute function private.capture_price_research_prices();

create function public.rpc_get_price_research_prices(p_company_id uuid,p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_status text; v_data jsonb;
begin
  perform private.require_permission(p_company_id,'purchase_round.view');
  perform private.require_permission(p_company_id,'quotation_response.view');
  select status into v_status from public.purchase_rounds where company_id=p_company_id and id=p_round_id and price_research_routine_id is not null;
  if v_status is null then raise exception 'Coleta não encontrada'; end if;
  if v_status='completed' then
    select data into v_data from public.price_research_snapshots where company_id=p_company_id and round_id=p_round_id;
    if v_data is null then raise exception 'Retrato da coleta não encontrado'; end if;
    return v_data;
  end if;
  return private.price_research_prices(p_company_id,p_round_id);
end; $$;
revoke all on function public.rpc_get_price_research_prices(uuid,uuid) from public;
grant execute on function public.rpc_get_price_research_prices(uuid,uuid) to authenticated;
commit;
