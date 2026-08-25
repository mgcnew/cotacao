-- 0047_whatsapp_connection_per_company.sql
--
-- O onboarding autônomo provisiona uma instância Evolution por empresa. A
-- restrição também protege contra dois cliques simultâneos criando instâncias
-- órfãs para o mesmo tenant.

begin;

create unique index if not exists whatsapp_connections_one_per_company_uidx
on public.whatsapp_connections(company_id);

commit;
