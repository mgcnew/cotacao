-- Amplia o bucket privado do WhatsApp para imagens recebidas.

begin;

update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['audio/*', 'image/*']::text[]
where id = 'whatsapp-media';

commit;
