-- 0125_stock_count_recount_and_public_link.sql
-- Contagem de estoque: marcar produto para recontar e link público de leitura.
--
-- Marcação: fica no produto da contagem, então quem abrir a mesma contagem em
-- outro celular vê o destaque. O app tira a marca no primeiro lançamento
-- depois de "Recontar do zero".
--
-- Link: diferente dos links de fornecedor, o token fica guardado em claro. A
-- mensagem do WhatsApp sai várias vezes com o MESMO link; guardar só o hash
-- obrigaria a gerar um link novo (e matar o anterior) a cada compartilhamento.
-- O que ele abre é só leitura, sem valores, e "Trocar link" invalida o antigo.

begin;

alter table public.stock_count_items
  add column needs_recount boolean not null default false;

grant update (needs_recount) on public.stock_count_items to authenticated;

-- Volátil no default: cada contagem existente ganha um token próprio.
alter table public.stock_counts
  add column public_token text not null
    default encode(extensions.gen_random_bytes(24), 'hex')
    check (public_token ~ '^[0-9a-f]{48}$');

alter table public.stock_counts
  add constraint stock_counts_public_token_key unique (public_token);

grant update (public_token) on public.stock_counts to authenticated;

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
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
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
