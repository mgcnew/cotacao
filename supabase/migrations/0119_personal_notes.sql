-- 0119_personal_notes.sql
-- Anotações pessoais: o bloco de notas de quem compra.
--
-- Diferente dos avisos de fornecedor (0045), que são da equipe, cada anotação
-- aqui pertence a uma pessoa e só ela a vê — nem administrador lê. A página de
-- anotações mostra as duas coisas juntas; quem precisa que a equipe saiba de
-- algo continua registrando o aviso no fornecedor.
--
-- O que uma anotação pode ter, além do texto:
--   - etiqueta, de uma lista fixa (a cor sai dela na tela);
--   - fixada no topo;
--   - lembrete com data, e concluída ou não;
--   - checklist, como lista de {id, text, done} dentro da própria linha — são
--     poucos itens e só a dona os edita, então uma tabela à parte não pagaria
--     o custo;
--   - vínculo com um fornecedor, produto, pedido ou rodada. O vínculo é
--     polimórfico e sem chave estrangeira de propósito: apagar o produto não
--     pode apagar a anotação de alguém; a tela mostra "removido".

begin;

create table public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  title text
    check (title is null or char_length(btrim(title)) between 1 and 120),
  body text
    check (body is null or char_length(body) <= 5000),
  label text
    check (label is null or label in (
      'negociacao', 'pendencia', 'ideia', 'importante', 'conferir'
    )),
  pinned boolean not null default false,
  due_date date,
  done_at timestamptz,
  checklist jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(checklist) = 'array'
      and jsonb_array_length(checklist) <= 50
    ),
  link_kind text
    check (link_kind is null or link_kind in (
      'supplier', 'product', 'order', 'round'
    )),
  link_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  check ((link_kind is null) = (link_id is null)),
  -- Anotação vazia não é anotação.
  check (
    nullif(btrim(coalesce(title, '')), '') is not null
    or nullif(btrim(coalesce(body, '')), '') is not null
    or jsonb_array_length(checklist) > 0
  )
);

create index personal_notes_owner_idx
on public.personal_notes(company_id, user_id, pinned desc, updated_at desc);

create index personal_notes_due_idx
on public.personal_notes(company_id, user_id, due_date)
where done_at is null and due_date is not null;

create trigger personal_notes_set_updated_at
before update on public.personal_notes
for each row execute function private.set_updated_at();

alter table public.personal_notes enable row level security;

revoke all on public.personal_notes from anon;
grant select, insert, delete on public.personal_notes to authenticated;
-- Dona e empresa não mudam depois de criada.
grant update (
  title, body, label, pinned, due_date, done_at, checklist, link_kind, link_id
) on public.personal_notes to authenticated;

create policy personal_notes_select_own
on public.personal_notes
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_company_member(company_id))
);

create policy personal_notes_insert_own
on public.personal_notes
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_company_member(company_id))
);

create policy personal_notes_update_own
on public.personal_notes
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_company_member(company_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_company_member(company_id))
);

create policy personal_notes_delete_own
on public.personal_notes
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_company_member(company_id))
);

commit;
