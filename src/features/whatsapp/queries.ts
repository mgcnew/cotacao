import "server-only";

import { ORDER_STATUS_LABEL } from "@/features/orders/queries";
import { ROUND_STATUS_LABEL } from "@/features/rounds/status";
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  toInboxConversation,
  toInboxMessage,
  type ConversationContext,
  type InboxConversation,
  type InboxMessage,
} from "@/features/whatsapp/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getWhatsAppConnection(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a conexão do WhatsApp: ${error.message}`);
  return data;
}

export type WhatsAppMetrics = {
  sent: number;
  delivered: number;
  responseOpportunities: number;
  responded: number;
  averageResponseSeconds: number | null;
};

export async function getWhatsAppMetrics(companyId: string, days: number): Promise<WhatsAppMetrics> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_whatsapp_metrics", {
    p_company_id: companyId,
    p_days: days,
  });
  if (error) throw new Error(`Falha ao carregar indicadores do WhatsApp: ${error.message}`);
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    sent: Number(raw.sent ?? 0),
    delivered: Number(raw.delivered ?? 0),
    responseOpportunities: Number(raw.responseOpportunities ?? 0),
    responded: Number(raw.responded ?? 0),
    averageResponseSeconds: raw.averageResponseSeconds === null || raw.averageResponseSeconds === undefined
      ? null
      : Number(raw.averageResponseSeconds),
  };
}

/**
 * Todas as conversas recentes, sem filtro: quem filtra e busca é a tela, no
 * navegador, para trocar de aba e digitar sem esperar o servidor. O teto
 * existe porque o PostgREST corta em `max_rows` de qualquer forma.
 */
export async function listInboxConversations(
  companyId: string,
): Promise<InboxConversation[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(`${CONVERSATION_COLUMNS}, suppliers(name), supplier_contacts(name)`)
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(300);
  if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);
  return (data ?? []).map((row) =>
    toInboxConversation(row, {
      supplierName: row.suppliers?.name,
      contactName: row.supplier_contacts?.name,
    }),
  );
}

/** Uma conversa só — para o link direto a uma que ficou fora das mais recentes. */
export async function getInboxConversation(
  companyId: string,
  conversationId: string,
): Promise<InboxConversation | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(`${CONVERSATION_COLUMNS}, suppliers(name), supplier_contacts(name)`)
    .eq("company_id", companyId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar conversa: ${error.message}`);
  return data
    ? toInboxConversation(data, {
        supplierName: data.suppliers?.name,
        contactName: data.supplier_contacts?.name,
      })
    : null;
}

export const FIRST_PAGE_OF_MESSAGES = 80;

/**
 * As mensagens MAIS RECENTES, em ordem de leitura.
 *
 * Antes isto lia as 250 mais antigas (`ascending` + `limit`), e uma conversa
 * longa abria parada no passado, sem as últimas respostas do fornecedor.
 */
export async function listInboxMessages(
  companyId: string,
  conversationId: string,
  before?: string,
): Promise<{ messages: InboxMessage[]; hasMore: boolean }> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("whatsapp_messages")
    .select(MESSAGE_COLUMNS)
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: false })
    .limit(FIRST_PAGE_OF_MESSAGES + 1);
  if (before) query = query.lt("occurred_at", before);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar mensagens: ${error.message}`);
  const rows = data ?? [];
  const hasMore = rows.length > FIRST_PAGE_OF_MESSAGES;
  return {
    messages: rows.slice(0, FIRST_PAGE_OF_MESSAGES).reverse().map(toInboxMessage),
    hasMore,
  };
}

export async function listWhatsAppContacts(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, name, whatsapp, phone, supplier_id, suppliers(name)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .not("whatsapp", "is", null)
    .order("name");
  if (error) throw new Error(`Falha ao carregar contatos: ${error.message}`);
  return data ?? [];
}

export async function getWhatsAppContext(
  companyId: string,
  purchaseRoundId: string | null,
  orderId: string | null,
) {
  const supabase = await createServerSupabaseClient();
  const [roundResult, orderResult] = await Promise.all([
    purchaseRoundId
      ? supabase.from("purchase_rounds").select("id, title, status").eq("company_id", companyId).eq("id", purchaseRoundId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    orderId
      ? supabase.from("orders").select("id, status").eq("company_id", companyId).eq("id", orderId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (roundResult.error) throw roundResult.error;
  if (orderResult.error) throw orderResult.error;
  const round = roundResult.data;
  const order = orderResult.data;
  return {
    round: round
      ? { id: round.id, title: round.title, statusLabel: ROUND_STATUS_LABEL[round.status] ?? round.status }
      : null,
    order: order
      ? { id: order.id, statusLabel: ORDER_STATUS_LABEL[order.status] ?? order.status }
      : null,
  } satisfies ConversationContext;
}
