-- Guarda o XML autorizado da NF-e em armazenamento privado e vincula o
-- documento ao recebimento que será conferido.

begin;

create table public.receipt_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  receipt_id uuid not null,
  kind text not null default 'nfe_xml'
    check (kind in ('nfe_xml')),
  access_key text not null
    check (access_key ~ '^[0-9]{44}$'),
  file_name text not null
    check (char_length(btrim(file_name)) between 1 and 255),
  storage_path text not null,
  file_size integer not null
    check (file_size between 1 and 4194304),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  unique (company_id, id),
  unique (company_id, receipt_id, kind, access_key),
  unique (storage_path),

  foreign key (company_id, receipt_id)
    references public.receipts(company_id, id) on delete cascade
);

create index receipt_documents_receipt_idx
on public.receipt_documents(receipt_id, created_at desc);

alter table public.receipt_documents enable row level security;
revoke all on public.receipt_documents from anon;
grant select, insert, delete on public.receipt_documents to authenticated;

create policy receipt_documents_select_member
on public.receipt_documents for select to authenticated
using ((select private.is_company_member(company_id)));

create policy receipt_documents_insert_post
on public.receipt_documents for insert to authenticated
with check (
  (select private.has_permission(company_id, 'receipt.post'))
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.receipts r
    where r.company_id = receipt_documents.company_id
      and r.id = receipt_documents.receipt_id
      and r.status = 'draft'
  )
);

create policy receipt_documents_delete_draft
on public.receipt_documents for delete to authenticated
using (
  (select private.has_permission(company_id, 'receipt.post'))
  and exists (
    select 1
    from public.receipts r
    where r.company_id = receipt_documents.company_id
      and r.id = receipt_documents.receipt_id
      and r.status = 'draft'
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'receipt-documents',
  'receipt-documents',
  false,
  4194304,
  array['application/xml', 'text/xml']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy receipt_documents_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'receipt-documents'
  and (select private.is_company_member(
    ((storage.foldername(name))[1])::uuid
  ))
);

create policy receipt_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipt-documents'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid,
    'receipt.post'
  ))
  and exists (
    select 1
    from public.receipts r
    where r.company_id = ((storage.foldername(name))[1])::uuid
      and r.id = ((storage.foldername(name))[2])::uuid
      and r.status = 'draft'
  )
);

-- Usada apenas para desfazer o upload quando a gravação dos metadados falha.
create policy receipt_documents_storage_delete_draft
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipt-documents'
  and (select private.has_permission(
    ((storage.foldername(name))[1])::uuid,
    'receipt.post'
  ))
  and exists (
    select 1
    from public.receipts r
    where r.company_id = ((storage.foldername(name))[1])::uuid
      and r.id = ((storage.foldername(name))[2])::uuid
      and r.status = 'draft'
  )
);

commit;
