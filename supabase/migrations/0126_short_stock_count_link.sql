-- 0126_short_stock_count_link.sql
-- Link curto da contagem: 16 bytes em base64url (22 caracteres) no lugar de
-- 24 bytes em hexadecimal (48). Continua com 128 bits de aleatoriedade.
-- Os links de 48 já enviados seguem valendo; só os novos e os trocados
-- (`rotateStockCountLink`) saem curtos.

begin;

alter table public.stock_counts
  drop constraint if exists stock_counts_public_token_check;

alter table public.stock_counts
  add constraint stock_counts_public_token_check
    check (public_token ~ '^([0-9a-f]{48}|[A-Za-z0-9_-]{22})$');

-- O Postgres não tem base64url: troca `+/` por `-_` e tira o `=` do fim.
alter table public.stock_counts
  alter column public_token set default
    translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');

-- Só a projeção da conferência; anon não lê as tabelas, passa pelo token.
create or replace function public.rpc_public_get_stock_count(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^([0-9a-f]{48}|[A-Za-z0-9_-]{22})$' then
    raise sqlstate '42501' using message = 'Link invalido';
  end if;

  select sc.* into v_count
  from public.stock_counts sc
  where sc.public_token = p_token;

  if v_count.id is null then
    raise sqlstate '42501' using message = 'Link invalido';
  end if;

  select jsonb_build_object(
    'company', (
      select jsonb_build_object('name', c.name, 'timezone', c.timezone)
      from public.companies c where c.id = v_count.company_id
    ),
    'generated_at', now(),
    'name', v_count.name,
    'status', v_count.status,
    'created_at', v_count.created_at,
    'closed_at', v_count.closed_at,
    'author', (select p.full_name from public.profiles p where p.id = v_count.created_by),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', item.product_id,
          'name', product.name,
          'category', coalesce(category.name, 'Sem categoria'),
          'unit', unit.symbol,
          'needs_recount', item.needs_recount,
          'entries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'quantity', entry.quantity,
                'location', entry.location,
                'created_at', entry.created_at
              )
              order by entry.created_at
            )
            from public.stock_count_entries entry
            where entry.stock_count_item_id = item.id
          ), '[]'::jsonb)
        )
      )
      from public.stock_count_items item
      join public.products product
        on product.company_id = item.company_id and product.id = item.product_id
      left join public.categories category
        on category.id = product.category_id
      join public.units unit
        on unit.company_id = item.company_id and unit.id = item.unit_id
      where item.stock_count_id = v_count.id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_public_get_stock_count(text) from public;
grant execute on function public.rpc_public_get_stock_count(text)
to anon, authenticated;

commit;
