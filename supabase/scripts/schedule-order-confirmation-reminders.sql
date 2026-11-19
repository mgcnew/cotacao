-- Executar uma vez no SQL Editor do Supabase, após publicar a aplicação e
-- aplicar a migration 0133. Antes, crie no Vault (Dashboard > Integrations > Vault):
--   order_reminders_app_url: URL pública de produção, sem barra no final
--   order_reminders_cron_secret: mesmo valor de CRON_SECRET da Vercel
-- Não coloque o segredo no repositório ou diretamente no texto do cron.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'order_reminders_app_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'order_reminders_cron_secret') then
    raise exception 'Configure order_reminders_app_url e order_reminders_cron_secret no Vault antes de agendar.';
  end if;
end;
$$;

-- Idempotente: substitui o job existente sem criar uma segunda execução.
select cron.schedule(
  'order-confirmation-reminders',
  '* 11-20 * * 1-5', -- UTC: 8h–17h59 em São Paulo; a aplicação e a RPC também validam.
  $job$
    select net.http_get(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets
        where name = 'order_reminders_app_url' limit 1) || '/api/orders/confirmation-reminders',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'order_reminders_cron_secret' limit 1
      )),
      timeout_milliseconds := 60000
    );
  $job$
);
