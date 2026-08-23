"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import {
  configureEvolutionWebhook,
  getEvolutionConnectionState,
  sendWhatsAppText,
} from "@/lib/evolution/client";
import { getPermissions, requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

function whatsappUrl(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/whatsapp?${query.toString()}`;
}

function fail(message: string, conversationId?: string): never {
  redirect(whatsappUrl({ ...(conversationId ? { conversa: conversationId } : {}), erro: message }));
}

async function requireSendPermission(companyId: string) {
  const permissions = await getPermissions(companyId);
  if (!permissions.has("purchase_round.send")) fail("Você não tem permissão para enviar mensagens.");
}

export async function activateWhatsAppAction() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("role.manage")) fail("Somente um administrador pode ativar a integração.");

  // Importação estática é evitada no módulo de ambiente; os valores nunca
  // deixam esta Server Action.
  const env = (await import("@/lib/env")).getServerEnv();
  if (!env.EVOLUTION_INSTANCE || !env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_WEBHOOK_SECRET) {
    fail("Preencha URL, chave, instância e segredo de webhook da Evolution no ambiente do servidor.");
  }

  const state = await getEvolutionConnectionState(env.EVOLUTION_INSTANCE);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("whatsapp_connections").upsert({
    company_id: company.companyId,
    instance_name: env.EVOLUTION_INSTANCE,
    status: state.ok ? state.state : "error",
    phone_number: state.ok ? state.phone : null,
    last_connected_at: state.ok && state.state === "connected" ? new Date().toISOString() : null,
    last_error: state.ok ? null : state.error,
  }, { onConflict: "company_id,instance_name" });
  if (error) fail(`Não foi possível ativar: ${error.message}`);

  const webhook = await configureEvolutionWebhook(
    env.EVOLUTION_INSTANCE,
    `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/evolution/webhook`,
    env.EVOLUTION_WEBHOOK_SECRET,
  );
  if (!webhook.ok) {
    await supabase
      .from("whatsapp_connections")
      .update({ last_error: `Webhook: ${webhook.error}` })
      .eq("company_id", company.companyId)
      .eq("instance_name", env.EVOLUTION_INSTANCE);
    fail(`A instância foi associada, mas o webhook não foi configurado: ${webhook.error}`);
  }
  revalidatePath("/whatsapp");
  redirect("/whatsapp");
}

export async function verifyWhatsAppConnectionAction() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("role.manage")) fail("Somente um administrador pode verificar a conexão.");
  const supabase = await createServerSupabaseClient();
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, instance_name")
    .eq("company_id", company.companyId)
    .limit(1)
    .maybeSingle();
  if (!connection) fail("Ative a integração primeiro.");

  const state = await getEvolutionConnectionState(connection.instance_name);
  const { error } = await supabase
    .from("whatsapp_connections")
    .update({
      status: state.ok ? state.state : "error",
      phone_number: state.ok ? state.phone : null,
      last_connected_at: state.ok && state.state === "connected" ? new Date().toISOString() : undefined,
      last_error: state.ok ? null : state.error,
    })
    .eq("id", connection.id);
  if (error) fail(error.message);
  revalidatePath("/whatsapp");
}

export async function startWhatsAppConversationAction(formData: FormData) {
  const company = await requireActiveCompany();
  await requireSendPermission(company.companyId);
  const contactId = z.string().uuid().safeParse(formData.get("contact_id"));
  const roundId = z.string().uuid().optional().safeParse(
    String(formData.get("purchase_round_id") ?? "") || undefined,
  );
  if (!contactId.success) fail("Escolha um contato válido.");
  if (!roundId.success) fail("Cotação inválida.");
  const supabase = await createServerSupabaseClient();
  const [{ data: connection }, { data: contact }] = await Promise.all([
    supabase.from("whatsapp_connections").select("id").eq("company_id", company.companyId).limit(1).maybeSingle(),
    supabase.from("supplier_contacts").select("id, supplier_id, name, whatsapp").eq("company_id", company.companyId).eq("id", contactId.data).single(),
  ]);
  if (!connection) fail("A integração ainda não foi ativada.");
  const phone = normalizeWhatsAppPhone(contact?.whatsapp);
  if (!contact || !phone) fail("O contato selecionado não tem WhatsApp válido.");
  const remoteJid = `${phone}@s.whatsapp.net`;

  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (existing) {
    if (roundId.data) {
      await supabase
        .from("whatsapp_conversations")
        .update({ purchase_round_id: roundId.data })
        .eq("id", existing.id);
    }
    redirect(whatsappUrl({ conversa: existing.id }));
  }

  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      company_id: company.companyId,
      connection_id: connection.id,
      supplier_id: contact.supplier_id,
      supplier_contact_id: contact.id,
      remote_jid: remoteJid,
      normalized_phone: phone,
      display_name: contact.name,
      purchase_round_id: roundId.data ?? null,
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  redirect(whatsappUrl({ conversa: created.id }));
}

export async function sendWhatsAppMessageAction(formData: FormData) {
  const company = await requireActiveCompany();
  const user = await requireUser();
  await requireSendPermission(company.companyId);
  const parsed = z.object({
    conversation_id: z.string().uuid(),
    message: z.string().trim().min(1).max(4000),
  }).safeParse({
    conversation_id: formData.get("conversation_id"),
    message: formData.get("message"),
  });
  if (!parsed.success) fail("Digite uma mensagem de até 4.000 caracteres.");

  const supabase = await createServerSupabaseClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .select("*, whatsapp_connections(instance_name)")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.conversation_id)
    .single();
  if (conversationError || !conversation) fail("Conversa não encontrada.");

  const phone = normalizeWhatsAppPhone(conversation.normalized_phone ?? conversation.remote_jid);
  const instance = conversation.whatsapp_connections?.instance_name;
  if (!phone || !instance) fail("A conversa não possui um número ou instância válidos.", conversation.id);

  const result = await sendWhatsAppText(phone, parsed.data.message, instance);
  const now = new Date().toISOString();

  let alreadyExists = false;
  if (result.ok && result.externalMessageId) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("connection_id", conversation.connection_id)
      .eq("external_message_id", result.externalMessageId)
      .maybeSingle();
    alreadyExists = Boolean(data);
  }

  if (!alreadyExists) {
    const { error: insertError } = await supabase.from("whatsapp_messages").insert({
      company_id: company.companyId,
      connection_id: conversation.connection_id,
      conversation_id: conversation.id,
      external_message_id: result.ok ? result.externalMessageId : null,
      direction: "outbound",
      message_type: "text",
      body: parsed.data.message,
      status: result.ok ? "sent" : "failed",
      sender_user_id: user.id,
      occurred_at: now,
      sent_at: result.ok ? now : null,
      error_message: result.ok ? null : result.error,
    });
    if (insertError) fail(insertError.message, conversation.id);
  }

  await supabase.from("whatsapp_conversations").update({
    last_message_at: now,
    last_message_preview: parsed.data.message.slice(0, 180),
    last_direction: "outbound",
    awaiting_side: "supplier",
  }).eq("id", conversation.id);

  if (conversation.supplier_id) {
    await supabase.from("communication_logs").insert({
      company_id: company.companyId,
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

  revalidatePath("/whatsapp");
  if (!result.ok) fail(`Mensagem não enviada: ${result.error}`, conversation.id);
}

export async function markWhatsAppConversationReadAction(conversationId: string) {
  const company = await requireActiveCompany();
  await requireSendPermission(company.companyId);
  const supabase = await createServerSupabaseClient();
  await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("company_id", company.companyId).eq("id", conversationId);
  revalidatePath("/whatsapp");
}

export async function setWhatsAppConversationStateAction(formData: FormData) {
  const company = await requireActiveCompany();
  await requireSendPermission(company.companyId);
  const parsed = z.object({
    conversation_id: z.string().uuid(),
    awaiting_side: z.enum(["supplier", "buyer"]),
  }).safeParse({
    conversation_id: formData.get("conversation_id"),
    awaiting_side: formData.get("awaiting_side"),
  });
  if (!parsed.success) fail("Estado inválido.");
  const supabase = await createServerSupabaseClient();
  await supabase.from("whatsapp_conversations").update({ awaiting_side: parsed.data.awaiting_side }).eq("company_id", company.companyId).eq("id", parsed.data.conversation_id);
  revalidatePath("/whatsapp");
}

export async function linkWhatsAppConversationAction(formData: FormData) {
  const company = await requireActiveCompany();
  await requireSendPermission(company.companyId);
  const parsed = z.object({
    conversation_id: z.string().uuid(),
    contact_id: z.string().uuid(),
  }).safeParse({
    conversation_id: formData.get("conversation_id"),
    contact_id: formData.get("contact_id"),
  });
  if (!parsed.success) fail("Escolha um contato válido.");
  const supabase = await createServerSupabaseClient();
  const { data: contact, error: contactError } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, name, whatsapp")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.contact_id)
    .eq("is_active", true)
    .single();
  if (contactError || !contact) fail("Contato não encontrado.", parsed.data.conversation_id);
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({
      supplier_id: contact.supplier_id,
      supplier_contact_id: contact.id,
      display_name: contact.name,
      normalized_phone: normalizeWhatsAppPhone(contact.whatsapp),
    })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.conversation_id);
  if (error) fail(error.message, parsed.data.conversation_id);
  revalidatePath("/whatsapp");
}
