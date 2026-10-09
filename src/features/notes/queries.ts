import "server-only";

import {
  isNoteLabel,
  isNoteLinkKind,
  parseChecklist,
  type ChecklistItem,
  type NoteLabel,
  type NoteLinkKind,
} from "@/features/notes/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * A página de anotações: as anotações pessoais de quem está logado e, ao lado,
 * os avisos de fornecedor da equipe (0045) — o que foi combinado com cada um
 * continua morando na ficha dele, mas quem procura "o que eu preciso lembrar"
 * não deveria ter de abrir fornecedor por fornecedor.
 *
 * O recorte mora na URL, como nas outras listas.
 */

export const NOTE_VIEWS = {
  todas: "Todas",
  minhas: "Minhas",
  fornecedores: "Fornecedores",
  lembretes: "Lembretes",
  concluidas: "Concluídas",
} as const;

export type NoteView = keyof typeof NOTE_VIEWS;

export type NoteFilters = {
  ver: NoteView;
  etiqueta: NoteLabel | null;
  busca: string | null;
};

function texto(value: string | string[] | undefined): string | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  return raw ? raw : null;
}

export function parseNoteFilters(
  params: Record<string, string | string[] | undefined>,
): NoteFilters {
  const ver = texto(params.ver);
  const etiqueta = texto(params.etiqueta);
  // A busca entra num `or()` do PostgREST, onde vírgula, parêntese e aspas
  // são sintaxe.
  const busca = texto(params.busca)?.replace(/[,()"'\\%*]/g, " ").trim();
  return {
    ver: ver && ver in NOTE_VIEWS ? (ver as NoteView) : "todas",
    etiqueta: isNoteLabel(etiqueta) ? etiqueta : null,
    busca: busca ? busca.slice(0, 80) : null,
  };
}

export type NoteLink = {
  kind: NoteLinkKind;
  id: string;
  /** `null` quando o vinculado foi removido do sistema. */
  name: string | null;
};

export type PersonalNoteView = {
  id: string;
  title: string | null;
  body: string | null;
  label: NoteLabel | null;
  pinned: boolean;
  dueDate: string | null;
  doneAt: string | null;
  checklist: ChecklistItem[];
  link: NoteLink | null;
  updatedAt: string;
};

export type SupplierNoticeView = {
  id: string;
  supplierId: string;
  supplierName: string;
  kind: string;
  title: string;
  description: string | null;
  amount: number | null;
  dueDate: string | null;
  priority: string;
  status: string;
  createdByName: string;
  updatedAt: string;
};

export type FeedItem =
  | { source: "note"; note: PersonalNoteView }
  | { source: "notice"; notice: SupplierNoticeView };

/** Hoje (AAAA-MM-DD) no fuso da loja — lembrete é dia, não instante. */
export function todayInStore(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function resolveLinks(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
  links: { kind: NoteLinkKind; id: string }[],
): Promise<Map<string, string>> {
  const ids = (kind: NoteLinkKind) => [
    ...new Set(links.filter((l) => l.kind === kind).map((l) => l.id)),
  ];
  const names = new Map<string, string>();
  const [suppliers, products, orders, rounds] = await Promise.all([
    ids("supplier").length
      ? supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", ids("supplier"))
      : null,
    ids("product").length
      ? supabase
          .from("products")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", ids("product"))
      : null,
    ids("order").length
      ? supabase
          .from("orders")
          .select("id, order_number, suppliers ( name )")
          .eq("company_id", companyId)
          .in("id", ids("order"))
      : null,
    ids("round").length
      ? supabase
          .from("purchase_rounds")
          .select("id, title")
          .eq("company_id", companyId)
          .in("id", ids("round"))
      : null,
  ]);
  for (const row of suppliers?.data ?? []) names.set(`supplier:${row.id}`, row.name);
  for (const row of products?.data ?? []) names.set(`product:${row.id}`, row.name);
  for (const row of orders?.data ?? [])
    names.set(
      `order:${row.id}`,
      `Pedido #${row.order_number}${row.suppliers?.name ? ` · ${row.suppliers.name}` : ""}`,
    );
  for (const row of rounds?.data ?? []) names.set(`round:${row.id}`, row.title);
  return names;
}

export async function listNotesFeed(
  companyId: string,
  filters: NoteFilters,
  canSeeSupplierNotices: boolean,
) {
  const supabase = await createServerSupabaseClient();
  const today = todayInStore();
  const concluidas = filters.ver === "concluidas";

  // Minhas anotações. A RLS já entrega só as de quem está logado.
  const wantNotes = filters.ver !== "fornecedores";
  let notesQuery = supabase
    .from("personal_notes")
    .select(
      "id, title, body, label, pinned, due_date, done_at, checklist, link_kind, link_id, updated_at",
    )
    .eq("company_id", companyId);
  notesQuery = concluidas
    ? notesQuery.not("done_at", "is", null)
    : notesQuery.is("done_at", null);
  if (filters.ver === "lembretes") notesQuery = notesQuery.not("due_date", "is", null);
  if (filters.etiqueta) notesQuery = notesQuery.eq("label", filters.etiqueta);
  if (filters.busca)
    notesQuery = notesQuery.or(
      `title.ilike.*${filters.busca}*,body.ilike.*${filters.busca}*`,
    );

  // Avisos de fornecedor: só sem filtro de etiqueta, que é coisa das notas.
  const wantNotices =
    canSeeSupplierNotices &&
    !filters.etiqueta &&
    filters.ver !== "minhas";
  let noticesQuery = supabase
    .from("supplier_notices")
    .select(
      "id, supplier_id, kind, title, description, amount, due_date, priority, status, created_by_name, updated_at, suppliers ( name )",
    )
    .eq("company_id", companyId)
    .eq("status", concluidas ? "resolved" : "open");
  if (filters.ver === "lembretes")
    noticesQuery = noticesQuery.not("due_date", "is", null);
  if (filters.busca)
    noticesQuery = noticesQuery.or(
      `title.ilike.*${filters.busca}*,description.ilike.*${filters.busca}*`,
    );

  // Contadores das abas, independentes da aba aberta.
  const countNotes = () =>
    supabase
      .from("personal_notes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("done_at", null);
  const countNotices = () =>
    supabase
      .from("supplier_notices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "open");

  const [notes, notices, openNotes, openNotices, notesDue, noticesDue, overdueNotes] =
    await Promise.all([
      wantNotes
        ? notesQuery
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(concluidas ? 60 : 300)
        : null,
      wantNotices
        ? noticesQuery
            .order("priority", { ascending: true })
            .order("updated_at", { ascending: false })
            .limit(concluidas ? 60 : 300)
        : null,
      countNotes(),
      canSeeSupplierNotices ? countNotices() : null,
      countNotes().not("due_date", "is", null),
      canSeeSupplierNotices ? countNotices().not("due_date", "is", null) : null,
      countNotes().lt("due_date", today),
    ]);
  // Tabela ainda não criada (migration 0119 pendente): a página continua de
  // pé com os avisos de fornecedor, e avisa o que falta.
  const migrationPending =
    notes?.error?.code === "PGRST205" ||
    notes?.error?.code === "42P01" ||
    openNotes.error?.code === "PGRST205" ||
    openNotes.error?.code === "42P01";
  if (notes?.error && !migrationPending)
    throw new Error(`Falha ao listar anotações: ${notes.error.message}`);
  if (notices?.error)
    throw new Error(`Falha ao listar avisos: ${notices.error.message}`);

  const noteRows = migrationPending ? [] : (notes?.data ?? []);
  const names = await resolveLinks(
    supabase,
    companyId,
    noteRows.flatMap((row) =>
      isNoteLinkKind(row.link_kind) && row.link_id
        ? [{ kind: row.link_kind, id: row.link_id }]
        : [],
    ),
  );

  const items: FeedItem[] = [
    ...noteRows.map((row): FeedItem => ({
      source: "note",
      note: {
        id: row.id,
        title: row.title,
        body: row.body,
        label: isNoteLabel(row.label) ? row.label : null,
        pinned: row.pinned,
        dueDate: row.due_date,
        doneAt: row.done_at,
        checklist: parseChecklist(row.checklist),
        link:
          isNoteLinkKind(row.link_kind) && row.link_id
            ? {
                kind: row.link_kind,
                id: row.link_id,
                name: names.get(`${row.link_kind}:${row.link_id}`) ?? null,
              }
            : null,
        updatedAt: row.updated_at,
      },
    })),
    ...(notices?.data ?? []).map((row): FeedItem => ({
      source: "notice",
      notice: {
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.suppliers?.name ?? "Fornecedor",
        kind: row.kind,
        title: row.title,
        description: row.description,
        amount: row.amount === null ? null : Number(row.amount),
        dueDate: row.due_date,
        priority: row.priority,
        status: row.status,
        createdByName: row.created_by_name,
        updatedAt: row.updated_at,
      },
    })),
  ];

  // Fixadas primeiro; depois, na aba de lembretes, a data mais próxima; no
  // resto, o que mudou por último. Aviso importante de fornecedor sobe junto
  // das fixadas — é o equivalente dele.
  const pinned = (item: FeedItem) =>
    item.source === "note" ? item.note.pinned : item.notice.priority === "high";
  const due = (item: FeedItem) =>
    (item.source === "note" ? item.note.dueDate : item.notice.dueDate) ??
    "9999-12-31";
  const updated = (item: FeedItem) =>
    item.source === "note" ? item.note.updatedAt : item.notice.updatedAt;
  items.sort((a, b) => {
    if (!concluidas && pinned(a) !== pinned(b)) return pinned(a) ? -1 : 1;
    if (filters.ver === "lembretes" && due(a) !== due(b))
      return due(a) < due(b) ? -1 : 1;
    return updated(b).localeCompare(updated(a));
  });

  return {
    items,
    today,
    migrationPending,
    counts: {
      minhas: openNotes.count ?? 0,
      fornecedores: openNotices?.count ?? 0,
      lembretes: (notesDue.count ?? 0) + (noticesDue?.count ?? 0),
      atrasadas: overdueNotes.count ?? 0,
    },
  };
}

/** Opções do vínculo no formulário: fornecedor, produto, pedido, rodada. */
export async function listNoteLinkOptions(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const [suppliers, products, orders, rounds] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("products")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("orders")
      .select("id, order_number, suppliers ( name )")
      .eq("company_id", companyId)
      .order("order_number", { ascending: false })
      .limit(200),
    supabase
      .from("purchase_rounds")
      .select("id, title, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return {
    supplier: (suppliers.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    product: (products.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    order: (orders.data ?? []).map((row) => ({
      id: row.id,
      name: `Pedido #${row.order_number}`,
      description: row.suppliers?.name ?? undefined,
    })),
    round: (rounds.data ?? []).map((row) => ({
      id: row.id,
      name: row.title,
      description: new Intl.DateTimeFormat("pt-BR").format(
        new Date(row.created_at),
      ),
    })),
  };
}

export type NoteLinkOptions = Awaited<ReturnType<typeof listNoteLinkOptions>>;
