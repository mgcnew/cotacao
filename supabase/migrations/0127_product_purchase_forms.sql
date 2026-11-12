-- 0127_product_purchase_forms.sql
-- Outras formas de comprar o mesmo produto: caixa, display, fardo.
--
-- O produto continua com as suas unidades (compra, precificação, comparação), e
-- elas continuam sendo a forma padrão. O que entra aqui são formas a mais, cada
-- uma com a sua equivalência para a unidade-base do produto: "1 cx = 12 un",
-- "1 dp = 6 un". A unidade-base é a de comparação, ou a de precificação quando
-- não há comparação — a mesma em que a rodada já normaliza o preço.
--
-- A equivalência fica em dois números, e não num fator só: quando a base é a
-- caixa e a forma nova é a unidade, "12 un = 1 cx" é exato, e 1/12 em
-- numeric(18,6) não seria.
--
-- Nada muda para quem não cadastrar uma forma: a tabela começa vazia e o
-- produto segue comprado como hoje. Ainda nenhuma rodada, lista ou pedido lê
-- esta tabela; quando ler, a forma já usada fica travada como as unidades
-- (0102), porque o preço foi escrito olhando para ela.

begin;

create table public.product_purchase_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  -- `unit_quantity` desta unidade equivalem a `base_quantity` da base.
  unit_quantity numeric(18,6) not null default 1 check (unit_quantity > 0),
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  -- A base em que a equivalência foi escrita. Guardada para que uma troca de
  -- unidade do produto não reinterprete "12" em silêncio (ver o gatilho abaixo).
  base_unit_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, product_id, unit_id),
  check (unit_id <> base_unit_id),
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade,
  foreign key (company_id, unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, base_unit_id)
    references public.units(company_id, id) on delete restrict
);

create index product_purchase_forms_product_idx
on public.product_purchase_forms(company_id, product_id);

create trigger product_purchase_forms_set_updated_at
before update on public.product_purchase_forms
for each row execute function private.set_updated_at();

alter table public.product_purchase_forms enable row level security;
revoke all on public.product_purchase_forms from anon;
grant select on public.product_purchase_forms to authenticated;

-- Escrita só pela RPC, que valida contra o produto sob lock.
create policy product_purchase_forms_select_member
on public.product_purchase_forms for select to authenticated
using ((select private.is_company_member(company_id)));

-- Trocar a unidade-base do produto mudaria o sentido de cada "1 cx = 12 un"
-- já escrito. A troca de unidades passa por 0089/0090 e pelo update direto do
-- cadastro; o gatilho cobre todos os caminhos de uma vez.
create or replace function private.guard_product_purchase_form_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base uuid := coalesce(new.comparison_unit_id, new.pricing_unit_id);
  v_symbol text;
begin
  select unit.symbol
  into v_symbol
  from public.product_purchase_forms form
  join public.units unit
    on unit.company_id = form.company_id
   and unit.id = form.base_unit_id
  where form.company_id = new.company_id
    and form.product_id = new.id
    and form.base_unit_id <> v_base
  limit 1;

  if found then
    raise exception 'Este produto tem outras formas de compra contadas em %. Remova-as antes de trocar a unidade de comparação.', v_symbol;
  end if;

  if exists (
    select 1
    from public.product_purchase_forms form
    where form.company_id = new.company_id
      and form.product_id = new.id
      and form.unit_id = new.purchase_unit_id
  ) then
    raise exception 'A unidade de compra escolhida já é uma das outras formas de compra deste produto. Remova-a de lá primeiro.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_product_purchase_form_units()
from public, anon, authenticated;

create trigger products_guard_purchase_form_units
before update of purchase_unit_id, pricing_unit_id, comparison_unit_id
on public.products
for each row
when (
  old.purchase_unit_id is distinct from new.purchase_unit_id
  or old.pricing_unit_id is distinct from new.pricing_unit_id
  or old.comparison_unit_id is distinct from new.comparison_unit_id
)
execute function private.guard_product_purchase_form_units();

-- Grava o conjunto inteiro de formas do produto: o que não vier some.
-- p_forms: [{ "unitId": uuid, "unitQuantity": num, "baseQuantity": num }]
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

    insert into public.product_purchase_forms (
      company_id, product_id, unit_id, unit_quantity, base_quantity,
      base_unit_id, created_by
    )
    values (
      p_company_id, p_product_id, v_unit_id, v_unit_quantity, v_base_quantity,
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

commit;
