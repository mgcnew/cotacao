-- 0031_company_search.sql
--
-- APLICADA em 2026-08-17.
--
-- PROBLEMA
-- O sistema nao tem busca. Achar um fornecedor, um produto, uma rodada ou um
-- pedido exige saber em qual das telas ele mora e navegar ate la.
--
-- E buscar com `ilike` do lado do app resolveria mal, por duas razoes:
--
-- 1. ACENTO. Os nomes deste dominio sao "Linguica", "Figado", "Coracao",
--    "Miudos", "Pe de porco". Com ilike acentuado, quem digita "linguica" nao
--    acha "Linguica" -- e ninguem digita acento numa caixa de busca.
-- 2. QUATRO IDAS AO BANCO. Uma consulta por tipo, a cada tecla digitada.
--
-- SOLUCAO
-- A extensao `unaccent` e uma funcao que faz a busca inteira em uma ida, com
-- ranking calculado no banco.
--
-- `unaccent` fica no schema `extensions`, que e onde o Supabase instala as
-- demais, e e chamada qualificada porque a funcao roda com `search_path = ''`.
--
-- SEGURANCA
-- A funcao NAO e security definer, de proposito: ela le pelas policies de quem
-- chama, como qualquer select do app. As policies de select destas quatro
-- tabelas exigem ser membro da empresa, o que nao distingue permissao por
-- modulo -- por isso quem chama diz o que quer ver (p_rounds, p_orders,
-- p_products, p_suppliers), e o app decide isso pelas permissoes do usuario.
-- Esconder e cortesia; a RLS e que nega.
--
-- `%` e `_` sao curingas do like: escapados aqui, senao quem digitasse "50%"
-- estaria pedindo outra coisa ao banco.
--
-- DESEMPENHO
-- Varredura sequencial, sem indice, e o certo nesta escala: a busca e sempre
-- dentro de UMA empresa, sobre catalogo e historico de uma operacao de compras.
-- `unaccent` e STABLE, nao IMMUTABLE, entao nem entraria num indice comum sem
-- uma funcao envelope -- complexidade que so se paga quando o volume pedir.
--
-- RANKING
-- Comeco de palavra vence pedaco no meio: quem digita "fri" quer "Frigorifico
-- Sul" antes de "Carne de sol do Frigorifico". Empate desfeito pelo tipo, na
-- ordem em que o comprador costuma procurar, e depois pelo nome.
--
-- MINIMO DE CARACTERES
-- Dois, para busca por nome. Numero de pedido e excecao: a busca por numero e
-- exata, entao "4" acha o pedido 4 sem trazer volume nenhum. Sem essa excecao,
-- pedido de um digito seria o unico impossivel de achar pela busca.
--
-- VERIFICADO apos aplicar: "linguica" acha "Linguica", "4" acha o pedido #4, o
-- ranking poe prefixo antes de contido, e a RLS corta o resultado para quem nao
-- e membro da empresa.

begin;

create extension if not exists unaccent with schema extensions;

create or replace function public.rpc_search_company(
  p_company_id uuid,
  p_term text,
  p_rounds boolean default false,
  p_orders boolean default false,
  p_products boolean default false,
  p_suppliers boolean default false,
  p_limit integer default 8
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  rank integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_termo text;
  v_padrao text;
  v_prefixo text;
  v_numero bigint;
  v_por_nome boolean;
begin
  v_termo := extensions.unaccent(lower(btrim(coalesce(p_term, ''))));
  v_termo := replace(replace(v_termo, '%', ' '), '_', ' ');

  -- Termo todo numerico pode ser o numero de um pedido.
  v_numero := case
    when v_termo ~ '^[0-9]+$' then v_termo::bigint
    else null
  end;

  -- Dois caracteres e o minimo para buscar por NOME: com um, a lista viria com
  -- o catalogo inteiro. Numero e outra historia -- "4" e o pedido 4, e a busca
  -- por numero e exata, entao um digito basta.
  v_por_nome := length(v_termo) >= 2;

  if not v_por_nome and v_numero is null then
    return;
  end if;

  v_padrao := '%' || v_termo || '%';
  v_prefixo := v_termo || '%';

  return query
  with achados as (
    select
      'round'::text as kind,
      pr.id,
      pr.title as title,
      null::text as subtitle,
      case
        when extensions.unaccent(lower(pr.title)) like v_prefixo then 1
        else 2
      end as rank,
      3 as tipo_ordem,
      pr.title as nome
    from public.purchase_rounds pr
    where p_rounds
      and v_por_nome
      and pr.company_id = p_company_id
      and extensions.unaccent(lower(pr.title)) like v_padrao

    union all

    select
      'order'::text,
      o.id,
      'Pedido #' || o.order_number,
      s.name,
      case
        when v_numero is not null and o.order_number = v_numero then 1
        else 2
      end,
      2,
      s.name
    from public.orders o
    join public.suppliers s
      on s.id = o.supplier_id
     and s.company_id = o.company_id
    where p_orders
      and o.company_id = p_company_id
      and (
        (v_numero is not null and o.order_number = v_numero)
        or (v_por_nome and extensions.unaccent(lower(s.name)) like v_padrao)
      )

    union all

    select
      'product'::text,
      p.id,
      p.name,
      c.name,
      case
        when extensions.unaccent(lower(p.name)) like v_prefixo then 1
        else 2
      end,
      1,
      p.name
    from public.products p
    left join public.categories c
      on c.id = p.category_id
     and c.company_id = p.company_id
    where p_products
      and v_por_nome
      and p.company_id = p_company_id
      and extensions.unaccent(lower(p.name)) like v_padrao

    union all

    select
      'supplier'::text,
      s.id,
      s.name,
      s.legal_name,
      case
        when extensions.unaccent(lower(s.name)) like v_prefixo then 1
        else 2
      end,
      0,
      s.name
    from public.suppliers s
    where p_suppliers
      and v_por_nome
      and s.company_id = p_company_id
      and (
        extensions.unaccent(lower(s.name)) like v_padrao
        or extensions.unaccent(lower(coalesce(s.legal_name, ''))) like v_padrao
      )
  )
  select a.kind, a.id, a.title, a.subtitle, a.rank
  from achados a
  order by a.rank, a.tipo_ordem, a.nome
  limit greatest(coalesce(p_limit, 8), 1);
end;
$$;

revoke all on function public.rpc_search_company(
  uuid, text, boolean, boolean, boolean, boolean, integer
) from public, anon;

grant execute on function public.rpc_search_company(
  uuid, text, boolean, boolean, boolean, boolean, integer
) to authenticated;

comment on function public.rpc_search_company(
  uuid, text, boolean, boolean, boolean, boolean, integer
) is 'Busca por nome em rodadas, pedidos, produtos e fornecedores, sem acento e com ranking. Invoker: le pelas policies de quem chama.';

commit;
