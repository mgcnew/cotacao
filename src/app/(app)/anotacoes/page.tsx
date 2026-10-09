import {
  CalendarClock,
  CheckCircle2,
  Link2,
  NotebookPen,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Store,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteNoteButton } from "@/components/notes/delete-note-button";
import { NoteDialog } from "@/components/notes/note-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  toggleChecklistItem,
  toggleNoteDone,
  toggleNotePinned,
} from "@/features/notes/actions";
import {
  NOTE_LABEL_STYLE,
  NOTE_LABEL_TEXT,
  NOTE_LABELS,
  NOTE_LINK_KIND_TEXT,
  noteLinkHref,
} from "@/features/notes/labels";
import {
  listNoteLinkOptions,
  listNotesFeed,
  NOTE_VIEWS,
  parseNoteFilters,
  type NoteFilters,
  type NoteView,
  type PersonalNoteView,
  type SupplierNoticeView,
} from "@/features/notes/queries";
import { SUPPLIER_NOTICE_KIND_LABEL } from "@/features/suppliers/notices";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

const BASE = "/anotacoes";
const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DIA.format(new Date(ano, mes - 1, dia));
}

function href(filters: NoteFilters, change: Partial<NoteFilters>): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.ver !== "todas") params.set("ver", next.ver);
  if (next.etiqueta) params.set("etiqueta", next.etiqueta);
  if (next.busca) params.set("busca", next.busca);
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

/**
 * Anotações: o bloco de notas pessoal de quem compra, com os avisos de
 * fornecedor da equipe ao lado.
 *
 * As anotações são de quem as escreveu (ninguém mais vê). Os avisos de
 * fornecedor continuam sendo da equipe e se resolvem na ficha do fornecedor —
 * aqui eles só aparecem, para que "o que eu preciso lembrar" fique num lugar.
 */
export default async function AnotacoesPage({
  searchParams,
}: PageProps<"/anotacoes">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  const filters = parseNoteFilters(await searchParams);
  const canSeeNotices = permissions.has("supplier.view");

  const [feed, linkOptions] = await Promise.all([
    listNotesFeed(company.companyId, filters, canSeeNotices),
    listNoteLinkOptions(company.companyId),
  ]);

  const tabs: { view: NoteView; count: number | null; alert?: boolean }[] = [
    { view: "todas", count: null },
    { view: "minhas", count: feed.counts.minhas },
    ...(canSeeNotices
      ? [{ view: "fornecedores" as const, count: feed.counts.fornecedores }]
      : []),
    {
      view: "lembretes",
      count: feed.counts.lembretes,
      alert: feed.counts.atrasadas > 0,
    },
    { view: "concluidas", count: null },
  ];
  const filtrando = Boolean(filters.etiqueta || filters.busca);

  return (
    <div className="w-full">
      <PageHeader
        title="Anotações"
        description="Seus lembretes, ideias e pendências — só você vê. Os avisos de fornecedor da equipe aparecem junto."
        action={<NoteDialog linkOptions={linkOptions} />}
      />

      {feed.migrationPending ? (
        <p className="border-warning/40 bg-warning/5 text-fg mb-4 rounded-xl border px-4 py-3 text-sm">
          As anotações pessoais ainda não estão disponíveis: falta aplicar a
          migration <code>0119_personal_notes.sql</code> no banco. Os avisos de
          fornecedor já aparecem abaixo.
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3">
        <nav aria-label="Ver" className="flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map(({ view, count, alert }) => {
            const ativa = filters.ver === view;
            return (
              <Link
                key={view}
                href={href(filters, { ver: view })}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "border-border inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  ativa
                    ? "bg-primary-solid text-primary-solid-fg border-primary-solid"
                    : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
                )}
              >
                {NOTE_VIEWS[view]}
                {count !== null ? (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      ativa
                        ? "opacity-80"
                        : alert
                          ? "text-destructive font-medium"
                          : "text-fg-subtle",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5" aria-label="Etiqueta">
            {NOTE_LABELS.map((label) => {
              const ativa = filters.etiqueta === label;
              return (
                <Link
                  key={label}
                  href={href(filters, { etiqueta: ativa ? null : label })}
                  aria-current={ativa ? "true" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
                    ativa
                      ? cn(NOTE_LABEL_STYLE[label].chip, "font-medium")
                      : "border-border text-fg-muted hover:text-fg",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", NOTE_LABEL_STYLE[label].dot)}
                  />
                  {NOTE_LABEL_TEXT[label]}
                </Link>
              );
            })}
          </div>

          <form method="get" action={BASE} className="flex items-center gap-2">
            {filters.ver !== "todas" ? (
              <input type="hidden" name="ver" value={filters.ver} />
            ) : null}
            {filters.etiqueta ? (
              <input type="hidden" name="etiqueta" value={filters.etiqueta} />
            ) : null}
            <div className="relative">
              <Search
                aria-hidden
                className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              />
              <Input
                name="busca"
                defaultValue={filters.busca ?? ""}
                placeholder="Buscar nas anotações"
                aria-label="Buscar nas anotações"
                className="h-8 w-full pl-8 text-sm sm:w-60"
              />
            </div>
          </form>
        </div>
      </div>

      {feed.items.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={
            filtrando
              ? "Nada neste recorte"
              : filters.ver === "concluidas"
                ? "Nenhuma anotação concluída"
                : "Nenhuma anotação ainda"
          }
          description={
            filtrando
              ? "Nenhuma anotação casa com a etiqueta ou a busca. Limpe o filtro para ver todas."
              : "Anote o que precisa lembrar: o desconto prometido, o produto para testar, o que conferir na próxima entrega."
          }
          action={
            filtrando ? (
              <Button asChild size="sm" variant="outline">
                <Link href={href(filters, { etiqueta: null, busca: null })}>
                  Limpar filtros
                </Link>
              </Button>
            ) : (
              <NoteDialog linkOptions={linkOptions} />
            )
          }
        />
      ) : (
        // Colunas, e não grade: cartões de alturas diferentes se encaixam sem
        // deixar buraco embaixo do mais curto.
        <div className="columns-1 gap-3 md:columns-2 xl:columns-3">
          {feed.items.map((item) =>
            item.source === "note" ? (
              <NoteCard
                key={`n-${item.note.id}`}
                note={item.note}
                today={feed.today}
                linkOptions={linkOptions}
              />
            ) : (
              <NoticeCard
                key={`s-${item.notice.id}`}
                notice={item.notice}
                today={feed.today}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function DueChip({
  dueDate,
  today,
  done,
}: {
  dueDate: string;
  today: string;
  done: boolean;
}) {
  const atrasada = !done && dueDate < today;
  const hoje = !done && dueDate === today;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums",
        atrasada
          ? "border-destructive/30 bg-destructive-soft text-destructive font-medium"
          : hoje
            ? "border-warning/30 bg-warning-soft text-warning font-medium"
            : "border-border text-fg-muted",
      )}
    >
      <CalendarClock className="size-3" aria-hidden />
      {atrasada ? "Atrasada · " : hoje ? "Hoje · " : ""}
      {formatarDia(dueDate)}
    </span>
  );
}

function NoteCard({
  note,
  today,
  linkOptions,
}: {
  note: PersonalNoteView;
  today: string;
  linkOptions: Awaited<ReturnType<typeof listNoteLinkOptions>>;
}) {
  const done = note.doneAt !== null;
  const feitos = note.checklist.filter((item) => item.done).length;
  return (
    <article
      className={cn(
        "border-border bg-surface relative mb-3 break-inside-avoid overflow-hidden rounded-xl border p-4 pl-5",
        done && "opacity-70",
      )}
    >
      {note.label ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            NOTE_LABEL_STYLE[note.label].bar,
          )}
        />
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {note.pinned ? (
          <Pin className="text-primary size-3.5" aria-label="Fixada" />
        ) : null}
        {note.label ? (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              NOTE_LABEL_STYLE[note.label].chip,
            )}
          >
            {NOTE_LABEL_TEXT[note.label]}
          </span>
        ) : null}
        {note.dueDate ? (
          <DueChip dueDate={note.dueDate} today={today} done={done} />
        ) : null}
        {done ? (
          <span className="text-success inline-flex items-center gap-1 text-xs">
            <CheckCircle2 className="size-3" aria-hidden /> Concluída
          </span>
        ) : null}
      </div>

      {note.title ? (
        <h2
          className={cn(
            "text-fg font-semibold wrap-anywhere",
            done && "line-through",
          )}
        >
          {note.title}
        </h2>
      ) : null}
      {note.body ? (
        <p className="text-fg-muted mt-1 text-sm whitespace-pre-wrap wrap-anywhere">
          {note.body}
        </p>
      ) : null}

      {note.checklist.length > 0 ? (
        <div className="mt-3">
          <p className="text-fg-subtle mb-1 text-xs tabular-nums">
            {feitos} de {note.checklist.length} feitos
          </p>
          <ul className="flex flex-col gap-0.5">
            {note.checklist.map((item) => (
              <li key={item.id}>
                <form action={toggleChecklistItem.bind(null, note.id, item.id)}>
                  <button
                    type="submit"
                    aria-pressed={item.done}
                    className="hover:bg-surface-sunken flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-sm"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                        item.done
                          ? "bg-success border-success text-white"
                          : "border-border-strong",
                      )}
                    >
                      {item.done ? "✓" : ""}
                    </span>
                    <span
                      className={cn(
                        "wrap-anywhere",
                        item.done ? "text-fg-subtle line-through" : "text-fg",
                      )}
                    >
                      {item.text}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {note.link ? (
        note.link.name ? (
          <Link
            href={noteLinkHref(note.link.kind, note.link.id)}
            className="border-border text-fg-muted hover:text-fg mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
          >
            <Link2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {NOTE_LINK_KIND_TEXT[note.link.kind]}: {note.link.name}
            </span>
          </Link>
        ) : (
          <span className="text-fg-subtle mt-3 inline-flex items-center gap-1.5 text-xs">
            <Link2 className="size-3" aria-hidden />
            {NOTE_LINK_KIND_TEXT[note.link.kind]} removido do sistema
          </span>
        )
      ) : null}

      <div className="border-border mt-3 flex flex-wrap items-center gap-1 border-t pt-2">
        {!done ? (
          <form action={toggleNotePinned.bind(null, note.id)}>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
            >
              {note.pinned ? (
                <>
                  <PinOff className="size-3" aria-hidden /> Desafixar
                </>
              ) : (
                <>
                  <Pin className="size-3" aria-hidden /> Fixar
                </>
              )}
            </Button>
          </form>
        ) : null}
        <form action={toggleNoteDone.bind(null, note.id)}>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
          >
            {done ? (
              <>
                <RotateCcw className="size-3" aria-hidden /> Reabrir
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3" aria-hidden /> Concluir
              </>
            )}
          </Button>
        </form>
        <NoteDialog
          linkOptions={linkOptions}
          note={{
            id: note.id,
            title: note.title,
            body: note.body,
            label: note.label,
            dueDate: note.dueDate,
            checklist: note.checklist,
            link: note.link
              ? { kind: note.link.kind, id: note.link.id }
              : null,
          }}
        />
        <DeleteNoteButton noteId={note.id} />
      </div>
    </article>
  );
}

function NoticeCard({
  notice,
  today,
}: {
  notice: SupplierNoticeView;
  today: string;
}) {
  const resolved = notice.status === "resolved";
  return (
    <article
      className={cn(
        "border-border bg-surface-sunken mb-3 break-inside-avoid rounded-xl border border-dashed p-4",
        resolved && "opacity-70",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-fg-muted inline-flex items-center gap-1 text-xs font-medium">
          <Store className="size-3" aria-hidden /> Aviso de fornecedor
        </span>
        <span className="border-border text-fg-muted rounded-full border px-2 py-0.5 text-xs">
          {SUPPLIER_NOTICE_KIND_LABEL[
            notice.kind as keyof typeof SUPPLIER_NOTICE_KIND_LABEL
          ] ?? notice.kind}
        </span>
        {notice.priority === "high" ? (
          <span className="bg-destructive-soft text-destructive border-destructive/30 rounded-full border px-2 py-0.5 text-xs">
            Importante
          </span>
        ) : null}
        {notice.dueDate ? (
          <DueChip dueDate={notice.dueDate} today={today} done={resolved} />
        ) : null}
      </div>
      <h2 className="text-fg font-semibold wrap-anywhere">{notice.title}</h2>
      <p className="text-fg-muted text-sm">
        <Link
          href={`/fornecedores/${notice.supplierId}`}
          className="hover:text-fg underline-offset-4 hover:underline"
        >
          {notice.supplierName}
        </Link>
        {notice.amount !== null ? ` · ${MONEY.format(notice.amount)}` : ""}
      </p>
      {notice.description ? (
        <p className="text-fg-muted mt-1 text-sm whitespace-pre-wrap wrap-anywhere">
          {notice.description}
        </p>
      ) : null}
      <div className="border-border mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span className="text-fg-subtle text-xs">
          Registrado por {notice.createdByName} · da equipe
        </span>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link href={`/fornecedores/${notice.supplierId}`}>
            {resolved ? "Ver no fornecedor" : "Resolver no fornecedor"}
          </Link>
        </Button>
      </div>
    </article>
  );
}
