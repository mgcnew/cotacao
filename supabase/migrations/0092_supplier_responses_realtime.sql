-- 0092_supplier_responses_realtime.sql
--
-- Publica o log transacional que sinaliza respostas de fornecedores. A UI
-- escuta apenas INSERTs da empresa ativa e atualiza a rota depois que a RPC
-- terminou de gravar a cotacao, confirmacao ou divergencia do pedido.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'domain_events'
  ) then
    alter publication supabase_realtime add table public.domain_events;
  end if;
end;
$$;

commit;
