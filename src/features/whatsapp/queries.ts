import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WhatsAppConversation = Awaited<ReturnType<typeof listWhatsAppConversations>>[number];

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

export async function listWhatsAppConversations(
  companyId: string,
  filter = "open",
  search = "",
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*, suppliers(name), supplier_contacts(name, whatsapp)")
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(150);
  if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);

  const needle = search.trim().toLocaleLowerCase("pt-BR");
  return (data ?? []).filter((conversation) => {
    if (filter === "unread" && conversation.unread_count === 0) return false;
    if (filter === "waiting_supplier" && conversation.awaiting_side !== "supplier") return false;
    if (filter === "waiting_buyer" && conversation.awaiting_side !== "buyer") return false;
    if (filter === "open" && conversation.status !== "open") return false;
    if (!needle) return true;
    const haystack = [
      conversation.display_name,
      conversation.normalized_phone,
      conversation.last_message_preview,
      conversation.suppliers?.name,
      conversation.supplier_contacts?.name,
    ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(needle);
  });
}

export async function listWhatsAppMessages(companyId: string, conversationId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true })
    .limit(250);
  if (error) throw new Error(`Falha ao carregar mensagens: ${error.message}`);
  return data ?? [];
}

export async function getWhatsAppConversation(companyId: string, conversationId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*, suppliers(name), supplier_contacts(name, whatsapp)")
    .eq("company_id", companyId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar conversa: ${error.message}`);
  return data;
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
  return { round: roundResult.data, order: orderResult.data };
}
