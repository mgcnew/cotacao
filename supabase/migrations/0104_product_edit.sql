-- 0104_product_edit.sql
-- Aviso de exposição do nome durante a edição de produto.
--
-- Renomear não é como corrigir unidade. Unidade reinterpreta um número que
-- outra pessoa já escreveu, por isso 0102 trava. Nome é rótulo, e o passado
-- está protegido por cópia: pedido enviado guarda `product_name_snapshot`
-- (0010) e rodada encerrada guarda o relatório inteiro em
-- `purchase_round_report_snapshots` (0059). Renomear não reescreve nem um nem
-- outro.
--
-- Resta um único lugar onde o nome é lido vivo e por terceiro: a rodada ainda
-- aberta que já foi ao fornecedor — `rpc_public_supplier_quotation` monta a
-- tela dele com `p.name` no momento do acesso (0014). Trocar o nome agora
-- troca o rótulo debaixo de quem está cotando.
--
-- Isso não trava a edição: é justamente montando a rodada que o comprador
-- relê os itens e percebe o erro de digitação. O que a função faz é dizer
-- quem está olhando, para a confirmação avisar antes.

begin;

create or replace function private.product_name_exposure(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- Rodada aberta com o produto em pauta e pelo menos um fornecedor que já
  -- recebeu o link. Rodada em rascunho fica de fora: ninguém de fora viu.
  -- Item cancelado também — saiu da pauta, o fornecedor não o vê mais.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', exposure.round_id,
        'title', exposure.title,
        'suppliers', exposure.suppliers
      )
      order by exposure.title
    ),
    '[]'::jsonb
  )
  from (
    select
      purchase_round.id as round_id,
      purchase_round.title,
      count(distinct round_supplier.supplier_id) as suppliers
    from public.quotation_items item
    join public.purchase_rounds purchase_round
      on purchase_round.company_id = item.company_id
     and purchase_round.id = item.purchase_round_id
    join public.round_suppliers round_supplier
      on round_supplier.company_id = purchase_round.company_id
     and round_supplier.purchase_round_id = purchase_round.id
    where item.company_id = p_company_id
      and item.product_id = p_product_id
      and item.commercial_status <> 'cancelled'
      and purchase_round.status = 'active'
      and round_supplier.first_sent_at is not null
    group by purchase_round.id, purchase_round.title
  ) exposure;
$$;

comment on function private.product_name_exposure(uuid, uuid) is
  'Rodadas abertas já enviadas a fornecedores em que o produto aparece. '
  'É onde o nome é lido vivo por terceiro; serve de aviso na edição, não de trava.';

create or replace function public.rpc_product_name_exposure(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission(p_company_id, 'product.view');

  if not exists (
    select 1
    from public.products product
    where product.company_id = p_company_id
      and product.id = p_product_id
  ) then
    raise exception 'Produto não encontrado';
  end if;

  return private.product_name_exposure(p_company_id, p_product_id);
end;
$$;

revoke all on function public.rpc_product_name_exposure(uuid, uuid)
from public, anon;
grant execute on function public.rpc_product_name_exposure(uuid, uuid)
to authenticated;

commit;
