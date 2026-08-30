-- Mantém a composição fiscal da NF-e separada dos preços dos produtos.

begin;

alter table public.receipts
add column nfe_totals jsonb
check (nfe_totals is null or jsonb_typeof(nfe_totals) = 'object');

create or replace function public.rpc_save_receipt_nfe_totals(
  p_company_id uuid,
  p_receipt_id uuid,
  p_totals jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission(p_company_id, 'receipt.post');

  if p_totals is not null and jsonb_typeof(p_totals) <> 'object' then
    raise exception 'Totais fiscais da NF-e inválidos';
  end if;

  update public.receipts
  set nfe_totals = p_totals
  where company_id = p_company_id
    and id = p_receipt_id
    and status = 'draft';

  if not found then
    raise exception 'Recebimento não encontrado ou já conferido';
  end if;
end;
$$;

revoke all on function public.rpc_save_receipt_nfe_totals(
  uuid, uuid, jsonb
) from public, anon;
grant execute on function public.rpc_save_receipt_nfe_totals(
  uuid, uuid, jsonb
) to authenticated;

commit;
