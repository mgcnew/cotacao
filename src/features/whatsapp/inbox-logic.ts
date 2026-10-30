import type {
  InboxConversation,
  InboxMessage,
  MessageStatus,
} from "@/features/whatsapp/types";

/**
 * Regras da caixa que rodam no navegador: filtro, busca, mistura de mensagens
 * que chegam por vários caminhos e rótulos de data.
 *
 * Ficam aqui, puras e sem React, porque a mesma mensagem pode chegar três vezes
 * — a resposta do envio, o Realtime e a recarga — e a tela precisa mostrar uma.
 */

export type InboxFilter =
  | "open"
  | "unread"
  | "waiting_supplier"
  | "waiting_buyer"
  | "promotions";

export const INBOX_FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "open", label: "Abertas" },
  { value: "unread", label: "Não lidas" },
  { value: "waiting_supplier", label: "Aguardando fornecedor" },
  { value: "waiting_buyer", label: "Aguardando você" },
  { value: "promotions", label: "Promoções" },
];

export function parseFilter(value: string | null | undefined): InboxFilter {
  return INBOX_FILTERS.some((item) => item.value === value)
    ? (value as InboxFilter)
    : "open";
}

export function conversationTitle(conversation: InboxConversation) {
  return (
    conversation.supplierName ??
    conversation.displayName ??
    conversation.phone ??
    "Número desconhecido"
  );
}

export function matchesFilter(
  conversation: InboxConversation,
  filter: InboxFilter,
) {
  if (filter === "promotions") return conversation.category === "promotion";
  if (conversation.category === "promotion") return false;
  if (filter === "unread") return conversation.unread > 0;
  if (filter === "waiting_supplier") return conversation.awaiting === "supplier";
  if (filter === "waiting_buyer") return conversation.awaiting === "buyer";
  return conversation.status === "open";
}

function fold(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesSearch(conversation: InboxConversation, needle: string) {
  if (!needle) return true;
  const haystack = fold(
    [
      conversation.displayName,
      conversation.phone,
      conversation.lastPreview,
      conversation.supplierName,
      conversation.contactName,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(needle);
}

export function foldSearch(value: string) {
  return fold(value.trim());
}

/** Mais recente primeiro; quem nunca trocou mensagem vai para o fim. */
export function sortConversations(list: InboxConversation[]) {
  return [...list].sort((a, b) => {
    const left = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const right = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return right - left;
  });
}

export function upsertConversation(
  list: InboxConversation[],
  incoming: InboxConversation,
) {
  const index = list.findIndex((item) => item.id === incoming.id);
  if (index === -1) return sortConversations([incoming, ...list]);
  const next = [...list];
  // Os nomes vêm de um join que o Realtime não faz: quem já os tinha os mantém.
  const current = next[index];
  next[index] = {
    ...incoming,
    supplierName: incoming.supplierName ?? current.supplierName,
    contactName: incoming.contactName ?? current.contactName,
  };
  return sortConversations(next);
}

export function filterCounts(list: InboxConversation[]) {
  const counts: Record<InboxFilter, number> = {
    open: 0,
    unread: 0,
    waiting_supplier: 0,
    waiting_buyer: 0,
    promotions: 0,
  };
  for (const conversation of list) {
    if (conversation.category === "promotion") {
      counts.promotions += 1;
      continue;
    }
    if (conversation.status === "open") counts.open += 1;
    if (conversation.unread > 0) counts.unread += 1;
    if (conversation.awaiting === "supplier") counts.waiting_supplier += 1;
    if (conversation.awaiting === "buyer") counts.waiting_buyer += 1;
  }
  return counts;
}

/* ───────────────────────── mensagens ───────────────────────── */

const STATUS_RANK: Record<MessageStatus, number> = {
  sending: 0,
  queued: 1,
  pending: 2,
  failed: 2.5,
  sent: 3,
  delivered: 4,
  read: 5,
  played: 6,
  deleted: 99,
};

/**
 * Entregue e lida só avançam. Os avisos do WhatsApp chegam fora de ordem, e
 * uma confirmação de "enviada" atrasada não pode apagar um "lida".
 */
export function mergeStatus(
  current: MessageStatus,
  incoming: MessageStatus,
): MessageStatus {
  return STATUS_RANK[incoming] >= STATUS_RANK[current] ? incoming : current;
}

function byTime(a: InboxMessage, b: InboxMessage) {
  const delta = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

export function upsertMessage(list: InboxMessage[], incoming: InboxMessage) {
  const index = list.findIndex(
    (item) =>
      item.id === incoming.id ||
      (incoming.externalId !== null && item.externalId === incoming.externalId),
  );
  if (index !== -1) {
    const next = [...list];
    const current = next[index];
    next[index] = {
      ...incoming,
      // `hasMedia` só vira verdadeiro: o evento de status não traz o arquivo.
      hasMedia: incoming.hasMedia || current.hasMedia,
      status: mergeStatus(current.status, incoming.status),
    };
    return next;
  }

  // A cópia confirmada chegou antes da resposta do envio: some o balão
  // provisório do mesmo texto em vez de mostrar a mensagem duas vezes.
  let base = list;
  if (incoming.direction === "outbound") {
    const pending = list.findIndex(
      (item) =>
        item.clientId !== undefined &&
        item.status === "sending" &&
        item.body === incoming.body,
    );
    if (pending !== -1) base = list.filter((_, i) => i !== pending);
  }
  return [...base, incoming].sort(byTime);
}

/** Troca o balão provisório pelo que o servidor confirmou. */
export function settleMessage(
  list: InboxMessage[],
  clientId: string,
  confirmed: InboxMessage,
) {
  const without = list.filter((item) => item.clientId !== clientId);
  return upsertMessage(without, confirmed);
}

export function patchMessageStatus(
  list: InboxMessage[],
  messageId: string,
  status: MessageStatus,
  error: string | null = null,
) {
  return list.map((item) =>
    item.id === messageId ? { ...item, status, error } : item,
  );
}

export function previewOf(message: InboxMessage) {
  if (message.body) return message.body.slice(0, 180);
  return (
    (
      {
        image: "Imagem",
        document: "Documento",
        audio: "Áudio",
        video: "Vídeo",
        contact: "Contato",
        location: "Localização",
        reaction: "Reação",
      } as Record<string, string>
    )[message.type] ?? "Mensagem"
  );
}

/* ───────────────────────── datas ───────────────────────── */

function dayParts(iso: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function dayKey(iso: string | Date, timeZone: string) {
  const { year, month, day } = dayParts(iso, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysBetween(fromKey: string, toKey: string) {
  const parse = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
}

/** Rótulo curto da lista: hora se for hoje, depois "Ontem", dia da semana, data. */
export function listTimeLabel(iso: string, now: Date, timeZone: string) {
  const age = daysBetween(dayKey(iso, timeZone), dayKey(now, timeZone));
  if (age <= 0) {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  }
  if (age === 1) return "Ontem";
  if (age < 7) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone })
      .format(new Date(iso))
      .replace(".", "");
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function dayDividerLabel(iso: string, now: Date, timeZone: string) {
  const age = daysBetween(dayKey(iso, timeZone), dayKey(now, timeZone));
  if (age <= 0) return "Hoje";
  if (age === 1) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(age > 300 ? { year: "numeric" as const } : {}),
    timeZone,
  }).format(new Date(iso));
}

export function formatClock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export type ThreadDay = {
  key: string;
  label: string;
  entries: Array<{
    message: InboxMessage;
    /** Primeira da sequência do mesmo lado: ganha mais respiro em cima. */
    startsRun: boolean;
  }>;
};

/**
 * Agrupa as mensagens por dia e marca onde uma sequência do mesmo lado começa —
 * é o que deixa a conversa legível sem avatar por bolha. Cada dia é um bloco
 * próprio para o rótulo "grudar" no topo só enquanto o dia dele está à vista.
 */
export function buildThread(
  messages: InboxMessage[],
  now: Date,
  timeZone: string,
): ThreadDay[] {
  const days: ThreadDay[] = [];
  let lastSide: InboxMessage["direction"] | null = null;
  for (const message of messages) {
    const key = dayKey(message.occurredAt, timeZone);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = {
        key,
        label: dayDividerLabel(message.occurredAt, now, timeZone),
        entries: [],
      };
      days.push(day);
      lastSide = null;
    }
    day.entries.push({ message, startsRun: lastSide !== message.direction });
    lastSide = message.direction;
  }
  return days;
}
