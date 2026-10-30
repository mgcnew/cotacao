/**
 * Formas enxutas da caixa do WhatsApp, usadas pelo servidor e pelo navegador.
 *
 * A tela guarda conversas e mensagens em estado e as atualiza com o que chega
 * do Realtime, sem pedir a página de novo. Por isso o tipo é só o que se
 * desenha — o `raw_payload` e as colunas de auditoria ficam no banco — e por
 * isso este arquivo não importa nada do servidor.
 */

export type ConversationCategory = "operational" | "promotion";
export type AwaitingSide = "supplier" | "buyer";

export type InboxConversation = {
  id: string;
  supplierId: string | null;
  supplierContactId: string | null;
  supplierName: string | null;
  contactName: string | null;
  displayName: string | null;
  phone: string | null;
  remoteJid: string;
  lastMessageAt: string | null;
  lastPreview: string | null;
  lastDirection: "inbound" | "outbound" | null;
  unread: number;
  awaiting: AwaitingSide | null;
  category: ConversationCategory;
  status: string;
  roundId: string | null;
  orderId: string | null;
};

export type MessageStatus =
  | "sending"
  | "queued"
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "played"
  | "failed"
  | "deleted";

export type InboxMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  hasMedia: boolean;
  fileName: string | null;
  status: MessageStatus;
  occurredAt: string;
  error: string | null;
  externalId: string | null;
  /** Texto que ainda não foi confirmado pelo servidor — só existe aqui. */
  clientId?: string;
};

export type ConversationContext = {
  round: { id: string; title: string; statusLabel: string } | null;
  order: { id: string; statusLabel: string } | null;
};

export type ConversationSnapshot = {
  messages: InboxMessage[];
  hasMore: boolean;
  context: ConversationContext;
};

/** Colunas lidas de `whatsapp_conversations` (mais os nomes vindos do join). */
export type ConversationRow = {
  id: string;
  supplier_id: string | null;
  supplier_contact_id: string | null;
  display_name: string | null;
  normalized_phone: string | null;
  remote_jid: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: string | null;
  unread_count: number;
  awaiting_side: string | null;
  inbox_category: string;
  status: string;
  purchase_round_id: string | null;
  order_id: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  message_type: string;
  body: string | null;
  media_path: string | null;
  media_file_name: string | null;
  status: string;
  occurred_at: string;
  error_message: string | null;
  external_message_id: string | null;
};

export const CONVERSATION_COLUMNS =
  "id, supplier_id, supplier_contact_id, display_name, normalized_phone, remote_jid, last_message_at, last_message_preview, last_direction, unread_count, awaiting_side, inbox_category, status, purchase_round_id, order_id";

export const MESSAGE_COLUMNS =
  "id, conversation_id, direction, message_type, body, media_path, media_file_name, status, occurred_at, error_message, external_message_id";

export function toInboxConversation(
  row: ConversationRow,
  names: { supplierName?: string | null; contactName?: string | null } = {},
): InboxConversation {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierContactId: row.supplier_contact_id,
    supplierName: names.supplierName ?? null,
    contactName: names.contactName ?? null,
    displayName: row.display_name,
    phone: row.normalized_phone,
    remoteJid: row.remote_jid,
    lastMessageAt: row.last_message_at,
    lastPreview: row.last_message_preview,
    lastDirection:
      row.last_direction === "inbound" || row.last_direction === "outbound"
        ? row.last_direction
        : null,
    unread: row.unread_count,
    awaiting:
      row.awaiting_side === "supplier" || row.awaiting_side === "buyer"
        ? row.awaiting_side
        : null,
    category: row.inbox_category === "promotion" ? "promotion" : "operational",
    status: row.status,
    roundId: row.purchase_round_id,
    orderId: row.order_id,
  };
}

export function toInboxMessage(row: MessageRow): InboxMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    type: row.message_type,
    body: row.body,
    hasMedia: Boolean(row.media_path),
    fileName: row.media_file_name,
    status: row.status as MessageStatus,
    occurredAt: row.occurred_at,
    error: row.error_message,
    externalId: row.external_message_id,
  };
}

/** Resposta das rotas da caixa: sempre um objeto, com `ok` dizendo se deu certo. */
export type InboxActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type SendOutcome =
  | { ok: true; message: InboxMessage }
  | { ok: false; error: string; message: InboxMessage | null };

export type LinkedContact = {
  supplierId: string;
  supplierName: string | null;
  contactId: string;
  contactName: string;
  phone: string;
};
