-- Áudios recebidos pelo WhatsApp ficam fora do banco e em armazenamento
-- privado. O acesso passa por uma rota autenticada da aplicação.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  20971520,
  array['audio/*']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
