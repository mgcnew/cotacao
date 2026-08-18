-- Cadastrar fornecedor e primeiro contato de uma vez.
--
-- O PROBLEMA QUE ISTO RESOLVE NÃO É ERGONOMIA
--
-- O cadastro estava partido em dois momentos: `createSupplier` gravava a
-- empresa e redirecionava para a ficha, onde só então se pedia o contato. Nada
-- obrigava a concluir — e `listSelectableSuppliers` (a consulta que alimenta
-- "convidar fornecedor" na rodada) faz `supplier_contacts!inner` com
-- `is_active = true`.
--
-- Ou seja: fornecedor sem contato ativo NÃO PODE ser convidado para nenhuma
-- rodada, e o sistema não avisa — ele simplesmente não aparece na lista. O
-- fluxo em dois passos convidava exatamente a esse estado.
--
-- POR QUE UMA RPC, E NÃO DUAS ESCRITAS SEGUIDAS NA ACTION
--
-- Duas escritas seguidas deixam a janela aberta: se a segunda falhar, nasce o
-- fornecedor meio-feito que esta migration existe para impedir. Dentro de uma
-- função é uma transação só — ou os dois existem, ou nenhum.
--
-- `security invoker` de propósito: os INSERTs continuam passando pelo RLS do
-- usuário, exatamente como passavam quando a action escrevia direto. A função
-- muda a atomicidade, não quem pode escrever.
--
-- O contato é opcional: comprar de alguém sem contato cadastrado é legítimo
-- (balcão, retirada). Quem decidir seguir sem ele fica sabendo, pela tela, que
-- aquele fornecedor não poderá ser convidado para cotação enquanto assim for.

create or replace function public.rpc_create_supplier_with_contact(
  p_company_id uuid,
  p_name text,
  p_legal_name text default null,
  p_document_number text default null,
  p_purchase_limit numeric default null,
  p_notes text default null,
  p_contact_name text default null,
  p_contact_role text default null,
  p_contact_whatsapp text default null,
  p_contact_phone text default null,
  p_contact_email text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplier_id uuid;
begin
  insert into public.suppliers (
    company_id, name, legal_name, document_number, purchase_limit, notes
  )
  values (
    p_company_id, p_name, p_legal_name, p_document_number, p_purchase_limit,
    p_notes
  )
  returning id into v_supplier_id;

  -- Sem nome de contato não há contato a criar. Um canal ao menos é exigido
  -- pela mesma razão de sempre: contato sem meio de falar não é contato.
  if coalesce(btrim(p_contact_name), '') <> '' then
    if coalesce(btrim(p_contact_whatsapp), '') = ''
       and coalesce(btrim(p_contact_phone), '') = ''
       and coalesce(btrim(p_contact_email), '') = '' then
      raise exception 'Informe ao menos um meio de contato para %', p_contact_name
        using errcode = 'check_violation';
    end if;

    insert into public.supplier_contacts (
      company_id, supplier_id, name, role, whatsapp, phone, email, is_primary
    )
    values (
      p_company_id,
      v_supplier_id,
      btrim(p_contact_name),
      nullif(btrim(coalesce(p_contact_role, '')), ''),
      nullif(btrim(coalesce(p_contact_whatsapp, '')), ''),
      nullif(btrim(coalesce(p_contact_phone, '')), ''),
      nullif(btrim(coalesce(p_contact_email, '')), ''),
      -- É o primeiro contato do fornecedor: principal por definição.
      true
    );
  end if;

  return v_supplier_id;
end;
$$;

comment on function public.rpc_create_supplier_with_contact is
  'Cria fornecedor e, opcionalmente, o primeiro contato na mesma transação.';

revoke all on function public.rpc_create_supplier_with_contact from public, anon;
grant execute on function public.rpc_create_supplier_with_contact to authenticated;
