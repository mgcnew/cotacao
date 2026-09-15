-- Desfazer uma associação errada entre a linha da NF-e e o produto do pedido.
--
-- `rpc_learn_supplier_product_alias` transforma um clique em regra permanente:
-- o casamento por código do fornecedor é o primeiro critério e tem confiança 1,
-- então uma escolha errada deixa de ser o erro de uma nota e passa a repetir-se
-- sozinha em toda nota seguinte daquele fornecedor, sem aviso. Não havia como
-- apagar o que foi aprendido — nem RPC, nem tela.
--
-- Esta função é o caminho de volta: esquece o que foi aprendido para aquela
-- descrição, devolvendo a linha à condição de não reconhecida. O vínculo em
-- `supplier_products` permanece de propósito: ele apenas diz que o fornecedor
-- vende o produto, o que costuma ser verdade por outros caminhos (cotação,
-- pedido) e não desvia nota nenhuma.

begin;

create or replace function public.rpc_forget_supplier_product_alias(
  p_company_id uuid,
  p_receipt_id uuid,
  p_supplier_name text,
  p_supplier_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_name text := nullif(pg_catalog.btrim(p_supplier_name), '');
  v_code text := nullif(pg_catalog.btrim(p_supplier_code), '');
  v_normalized_name text;
  v_deleted integer;
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if v_name is null then
    raise exception 'Descrição do produto na NF-e inválida';
  end if;

  -- O fornecedor sai do recebimento, como no aprendizado: quem confere a nota
  -- não escolhe de qual fornecedor a memória é apagada.
  select o.supplier_id
  into v_supplier_id
  from public.receipts r
  join public.orders o
    on o.company_id = r.company_id and o.id = r.order_id
  where r.company_id = p_company_id
    and r.id = p_receipt_id
    and r.status = 'draft'
  for update of r;

  if v_supplier_id is null then
    raise exception 'Recebimento não encontrado ou já conferido';
  end if;

  v_normalized_name := pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(v_name, '[[:space:]]+', ' ', 'g')
    )
  );

  -- Os dois critérios que casam a linha automaticamente precisam cair juntos:
  -- apagar só o código deixaria o nome recasando o mesmo produto errado.
  delete from public.supplier_product_aliases alias
  where alias.company_id = p_company_id
    and alias.supplier_id = v_supplier_id
    and (
      (v_code is not null and alias.supplier_code = v_code)
      or alias.normalized_name = v_normalized_name
    );
  get diagnostics v_deleted = row_count;

  return v_deleted > 0;
end;
$$;

revoke all on function public.rpc_forget_supplier_product_alias(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.rpc_forget_supplier_product_alias(
  uuid, uuid, text, text
) to authenticated;

commit;
