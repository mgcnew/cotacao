-- 0020_service_provision_company.sql
--
-- PROBLEMA
-- `private.provision_company` não é alcançável pela Data API: o schema
-- `private` não é exposto (decisão da migration 0004). Comprovado na prática —
-- POST /rest/v1/rpc/provision_company responde 404 PGRST202. Nem `service_role`
-- chega nela, porque a limitação é do PostgREST, não de permissão.
-- Consequência: não existe caminho para o app criar a primeira empresa, o que
-- inviabiliza o cadastro self-service exigido por um SaaS multiempresa.
--
-- SOLUÇÃO
-- Um wrapper em `public` que apenas delega para a função privada. Toda a lógica
-- (papéis, permissões, unidades, vínculo do dono) continua exatamente onde
-- está — este arquivo não a duplica nem a altera.
--
-- SEGURANÇA
-- EXECUTE somente para `service_role`. Como service_role ignora RLS, quem chama
-- é responsável por autenticar o usuário antes: o route handler valida a sessão
-- no servidor e passa o id do próprio usuário logado, nunca um id vindo do
-- cliente.

begin;

create or replace function public.rpc_service_provision_company(
  p_owner_user_id uuid,
  p_name text,
  p_legal_name text default null,
  p_document_number text default null,
  p_timezone text default 'America/Sao_Paulo',
  p_currency_code char(3) default 'BRL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_name text;
  v_document text;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Nome da empresa é obrigatório';
  end if;

  if p_owner_user_id is null then
    raise exception 'Usuário proprietário é obrigatório';
  end if;

  -- Guarda apenas dígitos: mantém a unicidade de companies.document_number
  -- imune a diferenças de formatação.
  v_document := nullif(regexp_replace(coalesce(p_document_number, ''), '\D', '', 'g'), '');

  if v_document is not null and length(v_document) <> 14 then
    raise exception 'CNPJ deve ter 14 dígitos';
  end if;

  if v_document is not null and exists (
    select 1 from public.companies c where c.document_number = v_document
  ) then
    raise exception 'Já existe uma empresa com este CNPJ' using errcode = '23505';
  end if;

  v_company_id := private.provision_company(
    p_owner_user_id,
    v_name,
    nullif(trim(coalesce(p_legal_name, '')), ''),
    v_document,
    coalesce(p_timezone, 'America/Sao_Paulo'),
    coalesce(p_currency_code, 'BRL')
  );

  return v_company_id;
end;
$$;

revoke all on function public.rpc_service_provision_company(
  uuid, text, text, text, text, char
) from public, anon, authenticated;

grant execute on function public.rpc_service_provision_company(
  uuid, text, text, text, text, char
) to service_role;

commit;
