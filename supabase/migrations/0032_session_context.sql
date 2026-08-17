-- 0032_session_context.sql
--
-- APLICADA em 2026-08-17.
--
-- PROBLEMA
-- Carregar "quem sou e o que posso" custava tres consultas em CADEIA:
--
--   getMemberships   261 ms  (empresas do usuario)
--   getPermissions   366 ms  (papel + overrides, duas consultas em paralelo)
--
-- E sao em cadeia por dependencia: as permissoes precisam do role_id e do
-- member_id que vem do membership. Medido em producao, 627 ms por render antes
-- de a tela consultar o proprio dado.
--
-- SOLUCAO
-- Uma funcao devolve vinculos e permissoes de uma vez. Uma ida em vez de tres
-- idas em serie -- e a rede, nao o Postgres, era o custo: cada uma dessas
-- consultas e trivial para o banco.
--
-- SEGURANCA
-- Nao e security definer: le pelas policies de quem chama, como o app fazia.
-- E o filtro por `auth.uid()` e explicito, mesmo com a RLS de company_members
-- ja limitando ao proprio usuario -- pedir ao banco o que ele ja garante
-- custaria nada, mas deixa a intencao no texto.
--
-- As permissoes reproduzem a MESMA regra de `private.has_permission`: override
-- `deny` vence, `allow` vence o papel, e o papel decide o resto. A regra estava
-- duplicada no TypeScript (dal.ts) e agora tem uma implementacao so, no lugar
-- onde a autorizacao de verdade acontece.
--
-- FORMATO
-- Uma linha por empresa, com as permissoes em array. O app escolhe a empresa
-- ativa pelo cookie, e para isso precisa da lista inteira -- o seletor de
-- empresa do cabecalho mostra todas.
--
-- VERIFICADO apos aplicar: devolve a empresa e as 40 permissoes do
-- Administrador; um override de `deny` remove a chave; quem nao e membro
-- recebe zero linhas.

begin;

create or replace function public.rpc_session_context()
returns table (
  company_id uuid,
  company_name text,
  company_status text,
  member_id uuid,
  role_id uuid,
  role_name text,
  permissions text[]
)
language sql
stable
set search_path = ''
as $$
  select
    cm.company_id,
    c.name as company_name,
    c.status as company_status,
    cm.id as member_id,
    cm.role_id,
    r.name as role_name,
    coalesce(
      (
        select array_agg(p.key order by p.key)
        from public.permissions p
        where coalesce(
          -- Override do membro vence o papel; `deny` vence `allow`.
          (
            select case mpo.effect when 'allow' then true else false end
            from public.member_permission_overrides mpo
            where mpo.company_member_id = cm.id
              and mpo.permission_id = p.id
            limit 1
          ),
          exists (
            select 1
            from public.role_permissions rp
            where rp.role_id = cm.role_id
              and rp.permission_id = p.id
          )
        )
      ),
      '{}'::text[]
    ) as permissions
  from public.company_members cm
  join public.companies c
    on c.id = cm.company_id
  join public.roles r
    on r.id = cm.role_id
   and r.company_id = cm.company_id
  where cm.user_id = (select auth.uid())
    and cm.status = 'active'
  order by c.name;
$$;

revoke all on function public.rpc_session_context() from public, anon;
grant execute on function public.rpc_session_context() to authenticated;

comment on function public.rpc_session_context()
is 'Vinculos ativos do usuario com as permissoes efetivas de cada um, em uma ida. Invoker: le pelas policies de quem chama.';

commit;
