import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import {
  getWhatsAppContext,
  listInboxConversations,
  listInboxMessages,
} from "@/features/whatsapp/queries";
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  toInboxConversation,
  toInboxMessage,
  type ConversationSnapshot,
  type InboxActionResult,
  type InboxConversation,
  type InboxMessage,
  type LinkedContact,
  type MessageRow,
  type SendOutcome,
} from "@/features/whatsapp/types";
import {
  getActiveCompany,
  getPermissions,
  getUser,
} from "@/lib/auth/dal";
import { sendWhatsAppText } from "@/lib/evolution/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Operações da caixa do WhatsApp, atrás de rotas `/api/whatsapp/inbox/*`.
 *
 * POR QUE ROTAS E NÃO SERVER ACTIONS
 *
 * O Next enfileira as Server Actions: só uma roda por vez em cada aba, e uma
 * navegação aborta a que está no ar. A caixa dispara várias de uma vez — abrir
 * a conversa, marcar como lida, adiantar a próxima, enviar — e elas esperavam
 * umas pelas outras. O "enviar" ficava atrás de um "marcar como lida" de um
 * segundo. Rotas comuns rodam em paralelo e não carregam o protocolo de RSC.
 *
 * A segurança é a mesma: sessão, empresa ativa e permissão são conferidas aqui,
 * e o banco ainda aplica RLS em cada consulta.
 */

export type InboxContext = {
  companyId: string;
  userId: string;
  permissions: Set<string>;
};

/** `null` quando não há sessão — a rota responde 401 em vez de redirecionar. */
export async function inboxContext(): Promise<InboxContext | null> {
  const user = await getUser();
  if (!user) return null;
  const company = await getActiveCompany();
  if (!company) return null;
  return {
    companyId: company.companyId,
    userId: user.id,
    permissions: await getPermissions(company.companyId),
  };
}

function denied(
  context: InboxContext,
  permission: "purchase_round.send" | "purchase_round.view",
) {
  if (context.permissions.has(permission)) return null;
  return permission === "purchase_round.send"
    ? "Você não tem permissão para enviar mensagens."
    : "Você não tem permissão para ver as conversas.";
}

/**
 * Acha a conversa do contato ou abre uma nova. Compartilhado pelo formulário
 * das outras telas (que redireciona) e pela caixa (que só quer a conversa).
 */
export async function ensureConversation(
  companyId: string,
  contactId: string,
  roundId: string | null,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const [{ data: connection }, { data: contact }] = await Promise.all([
    supabase.from("whatsapp_connections").select("id").eq("company_id", companyId).limit(1).maybeSingle(),
    supabase.from("supplier_contacts").select("id, supplier_id, name, whatsapp").eq("company_id", companyId).eq("id", contactId).single(),
  ]);
  if (!connection) return { ok: false, error: "A integração ainda não foi ativada." };
  const phone = normalizeWhatsAppPhone(contact?.whatsapp);
  if (!contact || !phone) return { ok: false, error: "O contato selecionado não tem WhatsApp válido." };
  const remoteJid = `${phone}@s.whatsapp.net`;

  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        inbox_category: "operational",
        categorized_at: new Date().toISOString(),
        ...(roundId ? { purchase_round_id: roundId } : {}),
      })
      .eq("id", existing.id);
    return { ok: true, conversationId: existing.id };
  }

  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      company_id: companyId,
      connection_id: connection.id,
      supplier_id: contact.supplier_id,
      supplier_contact_id: contact.id,
      remote_jid: remoteJid,
      normalized_phone: phone,
      display_name: contact.name,
      purchase_round_id: roundId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, conversationId: created.id };
}

export async function openConversation(
  context: InboxContext,
  contactId: string,
): Promise<InboxActionResult<{ conversation: InboxConversation }>> {
  const parsed = z.string().uuid().safeParse(contactId);
  if (!parsed.success) return { ok: false, error: "Escolha um contato válido." };
  const refused = denied(context, "purchase_round.send");
  if (refused) return { ok: false, error: refused };
  const result = await ensureConversation(context.companyId, parsed.data, null);
  if (!result.ok) return result;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(`${CONVERSATION_COLUMNS}, suppliers(name), supplier_contacts(name)`)
    .eq("company_id", context.companyId)
    .eq("id", result.conversationId)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Conversa não encontrada." };
  return {
    ok: true,
    conversation: toInboxConversation(data, {
      supplierName: data.suppliers?.name,
      contactName: data.supplier_contacts?.name,
    }),
  };
}

const sendSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  /** Reenvio de uma mensagem que falhou: reaproveita a mesma linha. */
  retryOfId: z.string().uuid().optional(),
});

export async function sendMessage(
  context: InboxContext,
  conversationId: string,
  input: unknown,
): Promise<SendOutcome> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(conversationId).success) {
    return { ok: false, error: "Digite uma mensagem de até 4.000 caracteres.", message: null };
  }
  const refused = denied(context, "purchase_round.send");
  if (refused) return { ok: false, error: refused, message: null };

  const supabase = await createServerSupabaseClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .select("id, company_id, connection_id, supplier_id, supplier_contact_id, normalized_phone, remote_jid, whatsapp_connections(instance_name)")
    .eq("company_id", context.companyId)
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) {
    return { ok: false, error: "Conversa não encontrada.", message: null };
  }
  const phone = normalizeWhatsAppPhone(conversation.normalized_phone ?? conversation.remote_jid);
  const instance = conversation.whatsapp_connections?.instance_name;
  if (!phone || !instance) {
    return { ok: false, error: "A conversa não possui um número ou instância válidos.", message: null };
  }

  const { text, retryOfId } = parsed.data;
  const result = await sendWhatsAppText(phone, text, instance);
  const now = new Date().toISOString();

  const fields = {
    external_message_id: result.ok ? result.externalMessageId : null,
    status: result.ok ? "sent" : "failed",
    sender_user_id: context.userId,
    occurred_at: now,
    sent_at: result.ok ? now : null,
    error_message: result.ok ? null : result.error,
  };

  let row: MessageRow | null = null;
  if (retryOfId) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .update(fields)
      .eq("company_id", context.companyId)
      .eq("conversation_id", conversation.id)
      .eq("id", retryOfId)
      .eq("status", "failed")
      .select(MESSAGE_COLUMNS)
      .maybeSingle();
    row = data;
  }
  if (!row) {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .insert({
        ...fields,
        company_id: context.companyId,
        connection_id: conversation.connection_id,
        conversation_id: conversation.id,
        direction: "outbound",
        message_type: "text",
        body: text,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error?.code === "23505" && result.ok && result.externalMessageId) {
      // O aviso da Evolution chegou antes de nós: a linha existe, só falta
      // dizer quem enviou.
      const { data: existing } = await supabase
        .from("whatsapp_messages")
        .update({ sender_user_id: context.userId })
        .eq("connection_id", conversation.connection_id)
        .eq("external_message_id", result.externalMessageId)
        .select(MESSAGE_COLUMNS)
        .maybeSingle();
      row = existing;
    } else if (error) {
      return {
        ok: false,
        error: result.ok
          ? `A mensagem saiu, mas não foi registrada: ${error.message}`
          : `Mensagem não enviada: ${result.error}`,
        message: null,
      };
    } else {
      row = data;
    }
  }
  const message = row ? toInboxMessage(row) : null;

  // Registro e resumo da lista não precisam atrasar a tela de quem enviou.
  after(async () => {
    // Mensagem que não saiu não muda a conversa: o fornecedor não recebeu nada,
    // então ninguém passou a "aguardar" ninguém.
    if (result.ok) {
      await supabase.from("whatsapp_conversations").update({
        last_message_at: now,
        last_message_preview: text.slice(0, 180),
        last_direction: "outbound",
        awaiting_side: "supplier",
        inbox_category: "operational",
        categorized_at: now,
      }).eq("id", conversation.id);
    }

    if (conversation.supplier_id) {
      await supabase.from("communication_logs").insert({
        company_id: context.companyId,
        supplier_id: conversation.supplier_id,
        supplier_contact_id: conversation.supplier_contact_id,
        channel: "whatsapp",
        provider: "evolution",
        direction: "outbound",
        status: result.ok ? "sent" : "failed",
        external_message_id: result.ok ? result.externalMessageId : null,
        error_message: result.ok ? null : result.error,
        sent_at: result.ok ? now : null,
      });
    }
  });

  if (!result.ok) {
    return { ok: false, error: `Mensagem não enviada: ${result.error}`, message };
  }
  return message
    ? { ok: true, message }
    : { ok: false, error: "A mensagem saiu, mas não foi registrada.", message: null };
}

export async function markRead(
  context: InboxContext,
  conversationId: string,
): Promise<InboxActionResult> {
  const parsed = z.string().uuid().safeParse(conversationId);
  if (!parsed.success) return { ok: false, error: "Conversa inválida." };
  const refused = denied(context, "purchase_round.send");
  if (refused) return { ok: false, error: refused };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("company_id", context.companyId)
    .eq("id", parsed.data)
    .gt("unread_count", 0);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function loadConversation(
  context: InboxContext,
  input: { conversationId: string; roundId: string | null; orderId: string | null },
): Promise<InboxActionResult<{ snapshot: ConversationSnapshot }>> {
  const parsed = z.object({
    conversationId: z.string().uuid(),
    roundId: z.string().uuid().nullable(),
    orderId: z.string().uuid().nullable(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conversa inválida." };
  const refused = denied(context, "purchase_round.view");
  if (refused) return { ok: false, error: refused };
  const [page, conversationContext] = await Promise.all([
    listInboxMessages(context.companyId, parsed.data.conversationId),
    getWhatsAppContext(context.companyId, parsed.data.roundId, parsed.data.orderId),
  ]);
  return {
    ok: true,
    snapshot: { messages: page.messages, hasMore: page.hasMore, context: conversationContext },
  };
}

export async function loadEarlier(
  context: InboxContext,
  input: { conversationId: string; before: string },
): Promise<InboxActionResult<{ messages: InboxMessage[]; hasMore: boolean }>> {
  const parsed = z.object({
    conversationId: z.string().uuid(),
    before: z.string().datetime({ offset: true }),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conversa inválida." };
  const refused = denied(context, "purchase_round.view");
  if (refused) return { ok: false, error: refused };
  const page = await listInboxMessages(context.companyId, parsed.data.conversationId, parsed.data.before);
  return { ok: true, ...page };
}

export async function refreshInbox(
  context: InboxContext,
): Promise<InboxActionResult<{ conversations: InboxConversation[] }>> {
  const refused = denied(context, "purchase_round.view");
  if (refused) return { ok: false, error: refused };
  return { ok: true, conversations: await listInboxConversations(context.companyId) };
}

const patchSchema = z.discriminatedUnion("kind", [
  // `null` existe para desfazer: marcar quem se espera era via de mão única, e
  // uma conversa marcada por engano ficava pendente para sempre na lista.
  z.object({ kind: z.literal("awaiting"), value: z.enum(["supplier", "buyer"]).nullable() }),
  z.object({ kind: z.literal("category"), value: z.enum(["operational", "promotion"]) }),
  z.object({ kind: z.literal("link"), contactId: z.string().uuid() }),
]);

export async function patchConversation(
  context: InboxContext,
  conversationId: string,
  input: unknown,
): Promise<InboxActionResult<{ linked?: LinkedContact }>> {
  const id = z.string().uuid().safeParse(conversationId);
  const parsed = patchSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "Pedido inválido." };
  const refused = denied(context, "purchase_round.send");
  if (refused) return { ok: false, error: refused };
  const supabase = await createServerSupabaseClient();
  const change = parsed.data;

  if (change.kind === "awaiting") {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ awaiting_side: change.value })
      .eq("company_id", context.companyId)
      .eq("id", id.data);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  if (change.kind === "category") {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({
        inbox_category: change.value,
        categorized_at: new Date().toISOString(),
        ...(change.value === "promotion" ? { unread_count: 0, awaiting_side: null } : {}),
      })
      .eq("company_id", context.companyId)
      .eq("id", id.data);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { data: contact, error: contactError } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, name, whatsapp, suppliers(name)")
    .eq("company_id", context.companyId)
    .eq("id", change.contactId)
    .eq("is_active", true)
    .single();
  if (contactError || !contact) return { ok: false, error: "Contato não encontrado." };
  const phone = normalizeWhatsAppPhone(contact.whatsapp);
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({
      supplier_id: contact.supplier_id,
      supplier_contact_id: contact.id,
      display_name: contact.name,
      normalized_phone: phone || null,
    })
    .eq("company_id", context.companyId)
    .eq("id", id.data);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    linked: {
      supplierId: contact.supplier_id,
      supplierName: contact.suppliers?.name ?? null,
      contactId: contact.id,
      contactName: contact.name,
      phone,
    },
  };
}
