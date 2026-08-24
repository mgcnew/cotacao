-- 0044_unique_product_supplier_names.sql
-- Impede novos produtos e fornecedores com o mesmo nome na empresa.

begin;

-- A coluna materializa a regra para as actions consultarem por igualdade e
-- para o trigger não precisar varrer nomes. Duplicidades históricas continuam
-- visíveis e intactas; a partir desta migration nenhuma nova pode nascer.
alter table public.products
  add column normalized_name text generated always as (
    lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
  ) stored;

alter table public.suppliers
  add column normalized_name text generated always as (
    lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
  ) stored;

create index products_company_normalized_name_idx
  on public.products(company_id, normalized_name);

create index suppliers_company_normalized_name_idx
  on public.suppliers(company_id, normalized_name);

-- Índice UNIQUE não pode ser criado enquanto houver duplicidades antigas. O
-- lock transacional por nome dá a mesma proteção para inserts concorrentes sem
-- apagar, renomear ou desamarrar históricos existentes por conta própria.
create or replace function private.prevent_duplicate_entity_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_name text;
begin
  v_normalized_name := pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        new.name,
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  );

  -- Serializa somente cadastros do mesmo tipo, empresa e nome. Assim duas
  -- requisições simultâneas não conseguem passar juntas pelo EXISTS abaixo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      tg_table_name || ':' || new.company_id::text || ':' || v_normalized_name,
      0
    )
  );

  if tg_table_name = 'products' then
    if exists (
      select 1
      from public.products p
      where p.company_id = new.company_id
        and p.normalized_name = v_normalized_name
        and p.id <> new.id
    ) then
      raise exception 'Já existe um produto com este nome nesta empresa.'
        using errcode = '23505',
              constraint = 'products_company_normalized_name_guard';
    end if;
  elsif tg_table_name = 'suppliers' then
    if exists (
      select 1
      from public.suppliers s
      where s.company_id = new.company_id
        and s.normalized_name = v_normalized_name
        and s.id <> new.id
    ) then
      raise exception 'Já existe um fornecedor com este nome nesta empresa.'
        using errcode = '23505',
              constraint = 'suppliers_company_normalized_name_guard';
    end if;
  else
    raise exception 'Tabela não suportada pela trava de nomes';
  end if;

  return new;
end;
$$;

create trigger products_prevent_duplicate_name
before insert or update of company_id, name on public.products
for each row execute function private.prevent_duplicate_entity_name();

create trigger suppliers_prevent_duplicate_name
before insert or update of company_id, name on public.suppliers
for each row execute function private.prevent_duplicate_entity_name();

revoke all on function private.prevent_duplicate_entity_name()
  from public, anon, authenticated;

commit;
