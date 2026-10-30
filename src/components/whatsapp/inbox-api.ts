import type {
  AwaitingSide,
  ConversationSnapshot,
  InboxActionResult,
  InboxConversation,
  InboxMessage,
  LinkedContact,
  SendOutcome,
} from "@/features/whatsapp/types";

/**
 * Chamadas da caixa às rotas `/api/whatsapp/inbox/*`.
 *
 * Todas devolvem a mesma forma — `{ ok: true, … }` ou `{ ok: false, error }` —,
 * inclusive quando a rede falha, para a tela tratar um caminho só. `null` em
 * `SendOutcome.message` significa "nada foi gravado".
 */

const BASE = "/api/whatsapp/inbox";
const TIMEOUT_MS = 30_000;

const OFFLINE = "Sem conexão com o servidor. Confira a internet e tente de novo.";

async function call<T extends { ok: boolean }>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T | { ok: false; error: string; message?: null }> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as T | null;
    if (data && typeof data === "object" && "ok" in data) return data;
    return { ok: false, error: "O servidor respondeu algo inesperado. Tente de novo." };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export function loadConversation(input: {
  conversationId: string;
  roundId: string | null;
  orderId: string | null;
}) {
  const query = new URLSearchParams();
  if (input.roundId) query.set("round", input.roundId);
  if (input.orderId) query.set("order", input.orderId);
  const suffix = query.size ? `?${query}` : "";
  return call<InboxActionResult<{ snapshot: ConversationSnapshot }>>(
    `/${input.conversationId}${suffix}`,
  );
}

export function loadEarlier(input: { conversationId: string; before: string }) {
  return call<InboxActionResult<{ messages: InboxMessage[]; hasMore: boolean }>>(
    `/${input.conversationId}/messages?before=${encodeURIComponent(input.before)}`,
  );
}

export function refreshInbox() {
  return call<InboxActionResult<{ conversations: InboxConversation[] }>>("");
}

export function openConversation(contactId: string) {
  return call<InboxActionResult<{ conversation: InboxConversation }>>("/open", {
    method: "POST",
    body: { contactId },
  });
}

export async function sendMessage(input: {
  conversationId: string;
  text: string;
  retryOfId?: string;
}): Promise<SendOutcome> {
  const result = await call<SendOutcome>(`/${input.conversationId}/messages`, {
    method: "POST",
    body: { text: input.text, retryOfId: input.retryOfId },
  });
  return result.ok ? result : { ok: false, error: result.error, message: "message" in result && result.message ? result.message : null };
}

export function markRead(conversationId: string) {
  return call<InboxActionResult>(`/${conversationId}/read`, { method: "POST", body: {} });
}

export function setAwaiting(conversationId: string, value: AwaitingSide | null) {
  return call<InboxActionResult>(`/${conversationId}`, {
    method: "PATCH",
    body: { kind: "awaiting", value },
  });
}

export function setCategory(
  conversationId: string,
  value: InboxConversation["category"],
) {
  return call<InboxActionResult>(`/${conversationId}`, {
    method: "PATCH",
    body: { kind: "category", value },
  });
}

export function linkContact(conversationId: string, contactId: string) {
  return call<InboxActionResult<{ linked?: LinkedContact }>>(`/${conversationId}`, {
    method: "PATCH",
    body: { kind: "link", contactId },
  });
}
