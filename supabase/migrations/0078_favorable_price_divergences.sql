-- 0078_favorable_price_divergences.sql
--
-- Preco de nota menor que o pedido e variacao favoravel, nao pendencia. O
-- registro continua existindo para analise, mas ja nasce aceito e nao aumenta
-- a criticidade operacional. Aumento de preco continua exigindo decisao.

begin;

create or replace function private.classify_favorable_price_divergence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'price'
     and coalesce(new.financial_impact, 0) < 0
     and new.status = 'pending' then
    new.status := 'accepted';
    new.resolution_notes := coalesce(
      nullif(new.resolution_notes, ''),
      'Preco praticado menor que o combinado; ganho reconhecido automaticamente.'
    );
    new.resolved_by := coalesce(auth.uid(), new.created_by);
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
end;
$$;

revoke all on function private.classify_favorable_price_divergence() from public, anon, authenticated;

drop trigger if exists commercial_divergences_classify_favorable
on public.commercial_divergences;

create trigger commercial_divergences_classify_favorable
before insert on public.commercial_divergences
for each row execute function private.classify_favorable_price_divergence();

-- Regulariza ganhos antigos que ainda aparecem como trabalho pendente.
update public.commercial_divergences
set status = 'accepted',
    resolution_notes = coalesce(
      nullif(resolution_notes, ''),
      'Preco praticado menor que o combinado; ganho reconhecido automaticamente.'
    ),
    resolved_by = coalesce(resolved_by, created_by),
    resolved_at = coalesce(resolved_at, now()),
    updated_at = now()
where type = 'price'
  and status = 'pending'
  and financial_impact < 0;

comment on function private.classify_favorable_price_divergence()
is 'Classifica automaticamente preco abaixo do pedido como ganho aceito, preservando o historico.';

commit;
