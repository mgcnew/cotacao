-- Preços e totais em BRL são decisões monetárias de duas casas. Quantidades,
-- pesos, conversões e custos normalizados de embalagem mantêm sua precisão.

begin;

create or replace function private.round_quotation_response_item_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.quoted_price := round(new.quoted_price, 2);
  return new;
end;
$$;

create or replace function private.round_negotiation_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.previous_price := round(new.previous_price, 2);
  new.new_price := round(new.new_price, 2);
  return new;
end;
$$;

create or replace function private.round_allocation_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.selected_price := round(new.selected_price, 2);
  new.benchmark_price_at_decision := round(new.benchmark_price_at_decision, 2);
  return new;
end;
$$;

create or replace function private.round_order_item_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.agreed_price := round(new.agreed_price, 2);
  return new;
end;
$$;

create or replace function private.round_receipt_item_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.practiced_price := round(new.practiced_price, 2);
  return new;
end;
$$;

create or replace function private.round_historical_nfe_item_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.practiced_price := round(new.practiced_price, 2);
  return new;
end;
$$;

create or replace function private.round_historical_nfe_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invoice_total := round(new.invoice_total, 2);
  return new;
end;
$$;

create or replace function private.round_receipt_document_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invoice_total := round(new.invoice_total, 2);
  return new;
end;
$$;

create or replace function private.normalize_price_divergence_money()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agreed numeric;
  v_practiced numeric;
  v_quantity numeric;
begin
  if new.type <> 'price' then
    return new;
  end if;

  select round(order_item.agreed_price, 2),
         round(receipt_item.practiced_price, 2),
         receipt_item.pricing_quantity_received
  into v_agreed, v_practiced, v_quantity
  from public.receipt_items receipt_item
  join public.order_revision_items order_item
    on order_item.company_id = receipt_item.company_id
   and order_item.id = receipt_item.order_revision_item_id
  where receipt_item.company_id = new.company_id
    and receipt_item.id = new.receipt_item_id;

  if v_agreed is null or v_practiced is null then
    return new;
  end if;
  if v_agreed = v_practiced then
    return null;
  end if;

  new.agreed_value := jsonb_build_object('price', v_agreed);
  new.realized_value := jsonb_build_object('price', v_practiced);
  new.financial_impact := round((v_practiced - v_agreed) * v_quantity, 2);
  return new;
end;
$$;

create or replace function private.normalize_price_divergence_event_money()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agreed numeric;
  v_practiced numeric;
begin
  if new.event_type <> 'commercial_divergence.detected'
     or new.payload ->> 'type' <> 'price' then
    return new;
  end if;

  v_agreed := round(nullif(new.payload ->> 'agreed_price', '')::numeric, 2);
  v_practiced := round(nullif(new.payload ->> 'practiced_price', '')::numeric, 2);
  if v_agreed is null or v_practiced is null then
    return new;
  end if;
  if v_agreed = v_practiced then
    return null;
  end if;

  new.payload := jsonb_set(
    jsonb_set(new.payload, '{agreed_price}', to_jsonb(v_agreed), true),
    '{practiced_price}', to_jsonb(v_practiced), true
  );
  return new;
end;
$$;

-- A mensagem também fica persistida na notificação. O frontend formata pelos
-- metadados, mas normalizar aqui mantém e-mails e futuros consumidores corretos.
create or replace function private.normalize_price_notification_money()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agreed numeric;
  v_practiced numeric;
begin
  if new.type <> 'commercial_divergence.detected' then
    return new;
  end if;

  v_agreed := round(nullif(new.metadata ->> 'agreed_price', '')::numeric, 2);
  v_practiced := round(nullif(new.metadata ->> 'practiced_price', '')::numeric, 2);
  if v_agreed is null or v_practiced is null then
    return new;
  end if;

  new.metadata := jsonb_set(
    jsonb_set(new.metadata, '{agreed_price}', to_jsonb(v_agreed), true),
    '{practiced_price}', to_jsonb(v_practiced), true
  );
  new.message := 'Preço combinado: R$ ' ||
    replace(to_char(v_agreed, 'FM999999999999990.00'), '.', ',') ||
    '. Preço na nota: R$ ' ||
    replace(to_char(v_practiced, 'FM999999999999990.00'), '.', ',') || '.';
  return new;
end;
$$;

drop trigger if exists a_round_quotation_response_item_money
on public.quotation_response_items;
create trigger a_round_quotation_response_item_money
before insert or update of quoted_price on public.quotation_response_items
for each row execute function private.round_quotation_response_item_money();

drop trigger if exists a_round_negotiation_money on public.negotiations;
create trigger a_round_negotiation_money
before insert or update of previous_price, new_price on public.negotiations
for each row execute function private.round_negotiation_money();

-- Executa antes do snapshot de embalagem, para a normalização partir do preço
-- comercial já arredondado e ainda preservar casas no custo por unidade.
drop trigger if exists a_round_allocation_money on public.purchase_allocations;
create trigger a_round_allocation_money
before insert or update of selected_price, benchmark_price_at_decision
on public.purchase_allocations
for each row execute function private.round_allocation_money();

drop trigger if exists a_round_order_item_money on public.order_revision_items;
create trigger a_round_order_item_money
before insert or update of agreed_price on public.order_revision_items
for each row execute function private.round_order_item_money();

drop trigger if exists a_round_receipt_item_money on public.receipt_items;
create trigger a_round_receipt_item_money
before insert or update of practiced_price on public.receipt_items
for each row execute function private.round_receipt_item_money();

drop trigger if exists a_round_historical_nfe_item_money
on public.historical_nfe_items;
create trigger a_round_historical_nfe_item_money
before insert or update of practiced_price on public.historical_nfe_items
for each row execute function private.round_historical_nfe_item_money();

drop trigger if exists a_round_historical_nfe_total
on public.historical_nfe_imports;
create trigger a_round_historical_nfe_total
before insert or update of invoice_total on public.historical_nfe_imports
for each row execute function private.round_historical_nfe_total();

drop trigger if exists a_round_receipt_document_total
on public.receipt_documents;
create trigger a_round_receipt_document_total
before insert or update of invoice_total on public.receipt_documents
for each row execute function private.round_receipt_document_total();

drop trigger if exists a_normalize_price_divergence_money
on public.commercial_divergences;
create trigger a_normalize_price_divergence_money
before insert on public.commercial_divergences
for each row execute function private.normalize_price_divergence_money();

drop trigger if exists a_normalize_price_divergence_event_money
on public.domain_events;
create trigger a_normalize_price_divergence_event_money
before insert on public.domain_events
for each row execute function private.normalize_price_divergence_event_money();

drop trigger if exists a_normalize_price_notification_money
on public.notifications;
create trigger a_normalize_price_notification_money
before insert or update of metadata on public.notifications
for each row execute function private.normalize_price_notification_money();

-- Regulariza o que já existe para que relatórios antigos e novos usem a mesma
-- regra. Colunas continuam numeric(18,6), preservando compatibilidade das views.
update public.quotation_response_items
set quoted_price = round(quoted_price, 2)
where quoted_price is not null and quoted_price <> round(quoted_price, 2);

update public.negotiations
set previous_price = round(previous_price, 2),
    new_price = round(new_price, 2)
where previous_price <> round(previous_price, 2)
   or new_price <> round(new_price, 2);

update public.purchase_allocations
set selected_price = round(selected_price, 2),
    benchmark_price_at_decision = round(benchmark_price_at_decision, 2)
where selected_price <> round(selected_price, 2)
   or benchmark_price_at_decision is distinct from round(benchmark_price_at_decision, 2);

update public.order_revision_items
set agreed_price = round(agreed_price, 2)
where agreed_price <> round(agreed_price, 2);

update public.receipt_items
set practiced_price = round(practiced_price, 2)
where practiced_price <> round(practiced_price, 2);

update public.historical_nfe_items
set practiced_price = round(practiced_price, 2)
where practiced_price is not null
  and practiced_price <> round(practiced_price, 2);

update public.historical_nfe_imports
set invoice_total = round(invoice_total, 2)
where invoice_total <> round(invoice_total, 2);

update public.receipt_documents
set invoice_total = round(invoice_total, 2)
where invoice_total is not null
  and invoice_total <> round(invoice_total, 2);

-- Divergências antigas criadas apenas por milésimos deixam de ser pendência.
-- As demais mantêm sua decisão, mas o impacto financeiro passa a centavos.
update public.commercial_divergences divergence
set agreed_value = jsonb_set(
      coalesce(divergence.agreed_value, '{}'::jsonb),
      '{price}',
      to_jsonb(round((divergence.agreed_value ->> 'price')::numeric, 2)),
      true
    ),
    realized_value = jsonb_set(
      coalesce(divergence.realized_value, '{}'::jsonb),
      '{price}',
      to_jsonb(round((divergence.realized_value ->> 'price')::numeric, 2)),
      true
    ),
    financial_impact = round(
      (
        round((divergence.realized_value ->> 'price')::numeric, 2)
        - round((divergence.agreed_value ->> 'price')::numeric, 2)
      ) * receipt_item.pricing_quantity_received,
      2
    ),
    status = case
      when round((divergence.realized_value ->> 'price')::numeric, 2)
         = round((divergence.agreed_value ->> 'price')::numeric, 2)
      then 'resolved'
      else divergence.status
    end,
    resolution_notes = case
      when round((divergence.realized_value ->> 'price')::numeric, 2)
         = round((divergence.agreed_value ->> 'price')::numeric, 2)
      then coalesce(
        nullif(divergence.resolution_notes, ''),
        'Diferença apenas além dos centavos; valores monetários equivalentes.'
      )
      else divergence.resolution_notes
    end,
    resolved_by = case
      when round((divergence.realized_value ->> 'price')::numeric, 2)
         = round((divergence.agreed_value ->> 'price')::numeric, 2)
      then coalesce(divergence.resolved_by, divergence.created_by)
      else divergence.resolved_by
    end,
    resolved_at = case
      when round((divergence.realized_value ->> 'price')::numeric, 2)
         = round((divergence.agreed_value ->> 'price')::numeric, 2)
      then coalesce(divergence.resolved_at, now())
      else divergence.resolved_at
    end,
    updated_at = now()
from public.receipt_items receipt_item
where divergence.company_id = receipt_item.company_id
  and divergence.receipt_item_id = receipt_item.id
  and divergence.type = 'price'
  and divergence.agreed_value ->> 'price' is not null
  and divergence.realized_value ->> 'price' is not null;

-- Alertas que nasceram apenas da precisão técnica não representam uma decisão
-- comercial e saem da caixa de notificações. O evento e a divergência resolvida
-- permanecem no histórico para auditoria.
delete from public.notifications notification
where notification.type = 'commercial_divergence.detected'
  and notification.resource_type = 'receipt_item'
  and exists (
    select 1
    from public.commercial_divergences divergence
    where divergence.company_id = notification.company_id
      and divergence.receipt_item_id = notification.resource_id
      and divergence.type = 'price'
      and divergence.status = 'resolved'
      and divergence.agreed_value ->> 'price'
        = divergence.realized_value ->> 'price'
  );

-- Corrige a apresentação das notificações antigas que representam diferenças
-- reais. O trigger acima normaliza os metadados e recompõe a mensagem em BRL.
update public.notifications notification
set metadata = jsonb_set(
      jsonb_set(
        notification.metadata,
        '{agreed_price}',
        to_jsonb(round((notification.metadata ->> 'agreed_price')::numeric, 2)),
        true
      ),
      '{practiced_price}',
      to_jsonb(round((notification.metadata ->> 'practiced_price')::numeric, 2)),
      true
    )
where notification.type = 'commercial_divergence.detected'
  and notification.metadata ->> 'agreed_price' is not null
  and notification.metadata ->> 'practiced_price' is not null;

revoke all on function private.round_quotation_response_item_money()
from public, anon, authenticated;
revoke all on function private.round_negotiation_money()
from public, anon, authenticated;
revoke all on function private.round_allocation_money()
from public, anon, authenticated;
revoke all on function private.round_order_item_money()
from public, anon, authenticated;
revoke all on function private.round_receipt_item_money()
from public, anon, authenticated;
revoke all on function private.round_historical_nfe_item_money()
from public, anon, authenticated;
revoke all on function private.round_historical_nfe_total()
from public, anon, authenticated;
revoke all on function private.round_receipt_document_total()
from public, anon, authenticated;
revoke all on function private.normalize_price_divergence_money()
from public, anon, authenticated;
revoke all on function private.normalize_price_divergence_event_money()
from public, anon, authenticated;
revoke all on function private.normalize_price_notification_money()
from public, anon, authenticated;

commit;
