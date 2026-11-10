-- 0123_stock_counts.sql
-- Contagem de estoque, para bater com o estoque do sistema.
--
-- Contagem → produtos contados → lançamentos. A unidade é escolhida por
-- produto DENTRO da contagem e não tem relação com a unidade de compra do
-- cadastro: serve só para dizer em que se contou. Cada lançamento é uma linha
-- (7 na geladeira, 24 no estoque) e o total do produto é a soma; não existe
-- total entre produtos diferentes. Sem valores em dinheiro.

begin;

-- Quem pode contar: as mesmas permissões que mexem na lista de compras.
create or replace function private.can_count_stock(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_company_id, 'product.update')
      or private.has_permission(p_company_id, 'purchase_round.create')
      or private.has_permission(p_company_id, 'order.create');
$$;

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  -- Opcional: em branco, a tela mostra "Contagem de <data>".
  name text
    check (name is null or char_length(btrim(name)) between 1 and 120),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check ((status = 'closed') = (closed_at is not null))
);

create index stock_counts_company_idx
on public.stock_counts(company_id, status, created_at desc);

create trigger stock_counts_set_updated_at
before update on public.stock_counts
for each row execute function private.set_updated_at();

-- Depois de stock_counts existir: função sql valida as tabelas na criação.
create or replace function private.stock_count_is_open(p_stock_count_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stock_counts
    where id = p_stock_count_id and status = 'open'
  );
$$;

create table public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  stock_count_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  -- Um produto aparece uma vez por contagem; os lançamentos é que se repetem.
  unique (stock_count_id, product_id),
  foreign key (company_id, stock_count_id)
    references public.stock_counts(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete restrict,
  foreign key (company_id, unit_id)
    references public.units(company_id, id) on delete restrict
);

create trigger stock_count_items_set_updated_at
before update on public.stock_count_items
for each row execute function private.set_updated_at();

create table public.stock_count_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  stock_count_id uuid not null,
  stock_count_item_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0),
  location text
    check (location is null or char_length(btrim(location)) between 1 and 60),
  counted_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, stock_count_id)
    references public.stock_counts(company_id, id) on delete cascade,
  foreign key (company_id, stock_count_item_id)
    references public.stock_count_items(company_id, id) on delete cascade
);

create index stock_count_entries_item_idx
on public.stock_count_entries(stock_count_item_id, created_at);

create index stock_count_entries_count_idx
on public.stock_count_entries(stock_count_id);

alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.stock_count_entries enable row level security;

revoke all on public.stock_counts from anon;
revoke all on public.stock_count_items from anon;
revoke all on public.stock_count_entries from anon;

grant select, insert, delete on public.stock_counts to authenticated;
grant update (name, status, closed_at) on public.stock_counts to authenticated;
grant select, insert, delete on public.stock_count_items to authenticated;
grant update (unit_id) on public.stock_count_items to authenticated;
-- Lançamento não se edita: errou, apaga e lança de novo.
grant select, insert, delete on public.stock_count_entries to authenticated;

-- Contagens
create policy stock_counts_select
on public.stock_counts for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy stock_counts_insert
on public.stock_counts for insert to authenticated
with check ((select private.can_count_stock(company_id)));

create policy stock_counts_update
on public.stock_counts for update to authenticated
using ((select private.can_count_stock(company_id)))
with check ((select private.can_count_stock(company_id)));

create policy stock_counts_delete
on public.stock_counts for delete to authenticated
using ((select private.can_count_stock(company_id)));

-- Produtos da contagem: só mexe enquanto ela está aberta.
create policy stock_count_items_select
on public.stock_count_items for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy stock_count_items_insert
on public.stock_count_items for insert to authenticated
with check (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
);

create policy stock_count_items_update
on public.stock_count_items for update to authenticated
using (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
)
with check (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
);

create policy stock_count_items_delete
on public.stock_count_items for delete to authenticated
using (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
);

-- Lançamentos: idem.
create policy stock_count_entries_select
on public.stock_count_entries for select to authenticated
using ((select private.has_permission(company_id, 'product.view')));

create policy stock_count_entries_insert
on public.stock_count_entries for insert to authenticated
with check (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
);

create policy stock_count_entries_delete
on public.stock_count_entries for delete to authenticated
using (
  (select private.can_count_stock(company_id))
  and private.stock_count_is_open(stock_count_id)
);

commit;
