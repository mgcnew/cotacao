-- Observações da rodada na visão de progresso.
--
-- A lista de Compras passou a editar título e observações na própria linha, e
-- editar exige ler: um formulário que abre com o campo de observações vazio
-- porque ninguém o carregou apaga o que estava lá no primeiro "Salvar".
--
-- `notes` entra NO FIM, e não ao lado de `title` como a leitura pediria: um
-- `create or replace view` só aceita acrescentar coluna depois das que já
-- existem — mudar a ordem exigiria derrubar a visão, e com ela as permissões e
-- tudo o que dependa dela. A ordem das colunas de uma visão não é contrato de
-- ninguém aqui; quem lê é o PostgREST, pelo nome.
--
-- `security_invoker` é repetido de propósito: `create or replace` preserva as
-- opções atuais, mas deixá-la implícita faria a próxima pessoa que ler este
-- arquivo não saber que a visão respeita o RLS de quem consulta.

create or replace view public.v_purchase_round_progress
  with (security_invoker = true)
as
  select
    pr.company_id,
    pr.id as purchase_round_id,
    pr.title,
    pr.status,
    count(distinct qi.id) as total_items,
    count(distinct rs.id) as total_suppliers,
    count(distinct rs.id) filter (where qr.status = 'completed') as suppliers_completed,
    count(distinct rs.id) filter (where coalesce(qr.status, 'not_started') <> 'completed') as suppliers_pending,
    count(distinct qi.id) filter (where qi.commercial_status = 'confirmed') as items_confirmed,
    count(distinct o.id) as orders_created,
    pr.created_at,
    pr.notes
  from public.purchase_rounds pr
    left join public.quotation_items qi
      on qi.purchase_round_id = pr.id and qi.company_id = pr.company_id
    left join public.round_suppliers rs
      on rs.purchase_round_id = pr.id and rs.company_id = pr.company_id
    left join public.quotation_responses qr
      on qr.round_supplier_id = rs.id and qr.company_id = rs.company_id
    left join public.orders o
      on o.purchase_round_id = pr.id and o.company_id = pr.company_id
  group by pr.company_id, pr.id, pr.title, pr.notes, pr.status, pr.created_at;
