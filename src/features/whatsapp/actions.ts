"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { reconcileWhatsAppConnection } from "@/features/whatsapp/reconcile";
import {
  connectEvolutionInstance,
  configureEvolutionWebhook,
  createEvolutionInstance,
  getEvolutionConnectionState,
  logoutEvolutionInstance,
} from "@/lib/evolution/client";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { publicEnv } from "@/lib/env";
import type { WhatsAppSetupState } from "@/features/whatsapp/connection-state";
import { ensureConversation } from "@/features/whatsapp/inbox-service";
import {
  findUnsupportedTemplateVariables,
  WHATSAPP_TEMPLATE_KINDS,
} from "@/features/whatsapp/message-templates";

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

function setupState(
  connection: {
    status: string;
    phone_number: string | null;
    last_connected_at: string | null;
    last_event_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
  } | null,
  overrides: Partial<WhatsAppSetupState> = {},
): WhatsAppSetupState {
  return {
    ok: connection?.status !== "error",
    configured: true,
    status: connection
      ? connection.status as WhatsAppSetupState["status"]
      : "not_connected",
    phone: connection?.phone_number ?? null,
    qrCode: null,
    message: connection?.last_error ?? null,
    lastConnectedAt: connection?.last_connected_at ?? null,
    lastEventAt: connection?.last_event_at ?? null,
    lastSyncAt: connection?.last_sync_at ?? null,
    ...overrides,
  };
}

function instanceName(companyId: string) {
  return `cotacao_${companyId.replace(/-/g, "").slice(0, 12)}_${randomBytes(6).toString("hex")}`;
}

function missingEvolutionInstance(error: string) {
  return /does not exist|não existe|not found|404/i.test(error);
}

async function requireWhatsAppManager() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("role.manage")) {
    return { company, allowed: false as const };
  }
  return { company, allowed: true as const };
}

export type WhatsAppTemplateState = {
  error: string | null;
  savedAt?: number;
  reset?: boolean;
};

const templateSchema = z.object({
  kind: z.enum(WHATSAPP_TEMPLATE_KINDS),
  intent: z.enum(["save", "reset"]),
  body: z.string().trim().max(4000),
});

export async function saveWhatsAppTemplateAction(
  _previous: WhatsAppTemplateState,
  formData: FormData,
): Promise<WhatsAppTemplateState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) return { error: "Somente um administrador pode alterar os modelos." };

  const parsed = templateSchema.safeParse({
    kind: formData.get("kind"),
    intent: formData.get("intent"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "O modelo informado é inválido." };

  const supabase = await createServerSupabaseClient();
  if (parsed.data.intent === "reset") {
    const { error } = await supabase
      .from("whatsapp_message_templates")
      .delete()
      .eq("company_id", access.company.companyId)
      .eq("kind", parsed.data.kind);
    if (error) return { error: `Não foi possível restaurar o modelo: ${error.message}` };
    revalidatePath("/configuracoes");
    return { error: null, reset: true, savedAt: Date.now() };
  }

  const body = parsed.data.body;
  if (body.length < 20) return { error: "Escreva uma mensagem com ao menos 20 caracteres." };
  if (!body.includes("{link}")) return { error: "Inclua a variável {link} para o acesso individual à cotação." };
  const unsupported = findUnsupportedTemplateVariables(body, parsed.data.kind);
  if (unsupported.length > 0) {
    return { error: `Variáveis não reconhecidas: ${unsupported.map((name) => `{${name}}`).join(", ")}.` };
  }

  const { error } = await supabase.from("whatsapp_message_templates").upsert({
    company_id: access.company.companyId,
    kind: parsed.data.kind,
    body,
  }, { onConflict: "company_id,kind" });
  if (error) return { error: `Não foi possível salvar o modelo: ${error.message}` };
  revalidatePath("/configuracoes");
  revalidatePath("/compras");
  return { error: null, reset: false, savedAt: Date.now() };
}

async function updateConnectionState(
  connection: {
    id: string;
    status: string;
    phone_number: string | null;
    last_connected_at: string | null;
    last_event_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
    instance_name: string;
  },
) {
  const state = await getEvolutionConnectionState(connection.instance_name);
  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();
  const update = state.ok
    ? {
        status: state.state,
        phone_number: state.phone ?? connection.phone_number,
        ...(state.state === "connected" && connection.status !== "connected"
          ? { last_connected_at: now }
          : {}),
        last_error: null,
      }
    : { status: "error", last_error: state.error };
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .update(update)
    .eq("id", connection.id)
    .select("status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .single();
  if (error) return setupState(connection, { ok: false, status: "error", message: error.message });
  return setupState(data);
}

export async function connectCompanyWhatsAppAction(): Promise<WhatsAppSetupState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) {
    return setupState(null, { ok: false, message: "Somente um administrador pode conectar o WhatsApp." });
  }

  const env = (await import("@/lib/env")).getServerEnv();
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_WEBHOOK_SECRET) {
    return setupState(null, {
      ok: false,
      configured: false,
      status: "not_configured",
      message: "Preencha URL, chave e segredo de webhook da Evolution no ambiente do servidor.",
    });
  }

  const supabase = await createServerSupabaseClient();
  let { data: connection, error: selectError } = await supabase
    .from("whatsapp_connections")
    .select("id, instance_name, status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .eq("company_id", access.company.companyId)
    .limit(1)
    .maybeSingle();
  if (selectError) return setupState(null, { ok: false, status: "error", message: selectError.message });

  let needsProvisioning = false;
  if (!connection) {
    const { data: created, error } = await supabase
      .from("whatsapp_connections")
      .insert({
        company_id: access.company.companyId,
        instance_name: instanceName(access.company.companyId),
        provider_mode: "baileys",
        status: "connecting",
      })
      .select("id, instance_name, status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
      .single();
    if (error?.code === "23505") {
      const retry = await supabase
        .from("whatsapp_connections")
        .select("id, instance_name, status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
        .eq("company_id", access.company.companyId)
        .limit(1)
        .single();
      connection = retry.data;
      selectError = retry.error;
    } else {
      connection = created;
      selectError = error;
      needsProvisioning = Boolean(created);
    }
  }
  if (selectError || !connection) {
    return setupState(null, { ok: false, status: "error", message: selectError?.message ?? "Não foi possível preparar a conexão." });
  }

  let currentState = await getEvolutionConnectionState(connection.instance_name);
  if (!needsProvisioning && !currentState.ok && !missingEvolutionInstance(currentState.error)) {
    await supabase.from("whatsapp_connections").update({ status: "error", last_error: currentState.error }).eq("id", connection.id);
    return setupState(connection, { ok: false, status: "error", message: currentState.error });
  }
  if (needsProvisioning || !currentState.ok) {
    const created = await createEvolutionInstance(connection.instance_name);
    if (!created.ok) {
      await supabase.from("whatsapp_connections").update({ status: "error", last_error: created.error }).eq("id", connection.id);
      return setupState(connection, { ok: false, status: "error", message: created.error });
    }
    currentState = { ok: true, state: "disconnected", phone: null };
  }

  const webhook = await configureEvolutionWebhook(
    connection.instance_name,
    `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/evolution/webhook`,
    env.EVOLUTION_WEBHOOK_SECRET,
  );
  if (!webhook.ok) {
    await supabase
      .from("whatsapp_connections")
      .update({ status: "error", last_error: `Webhook: ${webhook.error}` })
      .eq("id", connection.id);
    return setupState(connection, { ok: false, status: "error", message: `O webhook não foi configurado: ${webhook.error}` });
  }

  if (currentState.ok && currentState.state === "connected") {
    const refreshed = await updateConnectionState(connection);
    revalidatePath("/configuracoes");
    revalidatePath("/whatsapp");
    return { ...refreshed, message: "WhatsApp conectado." };
  }

  const result = await connectEvolutionInstance(connection.instance_name);
  if (!result.ok) {
    await supabase.from("whatsapp_connections").update({ status: "error", last_error: result.error }).eq("id", connection.id);
    return setupState(connection, { ok: false, status: "error", message: result.error });
  }
  await supabase.from("whatsapp_connections").update({ status: "connecting", last_error: null }).eq("id", connection.id);
  revalidatePath("/configuracoes");
  revalidatePath("/whatsapp");
  return setupState(connection, {
    ok: true,
    status: "connecting",
    qrCode: result.qrCode,
    message: result.qrCode
      ? "Leia o QR Code com o WhatsApp da empresa."
      : "A conexão foi iniciada. Aguarde alguns segundos e tente gerar o QR Code novamente.",
  });
}

export async function checkCompanyWhatsAppAction(): Promise<WhatsAppSetupState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) return setupState(null, { ok: false, message: "Acesso restrito ao administrador." });
  const supabase = await createServerSupabaseClient();
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, instance_name, status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .eq("company_id", access.company.companyId)
    .limit(1)
    .maybeSingle();
  if (!connection) return setupState(null);
  const result = await updateConnectionState(connection);
  revalidatePath("/configuracoes");
  revalidatePath("/whatsapp");
  return result;
}

export async function reconfigureCompanyWhatsAppAction(): Promise<WhatsAppSetupState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) return setupState(null, { ok: false, message: "Acesso restrito ao administrador." });
  const env = (await import("@/lib/env")).getServerEnv();
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_WEBHOOK_SECRET) {
    return setupState(null, {
      ok: false,
      configured: false,
      status: "not_configured",
      message: "Preencha URL, chave e segredo de webhook da Evolution no ambiente do servidor.",
    });
  }

  const service = createServiceRoleClient();
  const { data: connection, error } = await service
    .from("whatsapp_connections")
    .select("*")
    .eq("company_id", access.company.companyId)
    .limit(1)
    .maybeSingle();
  if (error || !connection) {
    return setupState(null, { ok: false, message: error?.message ?? "Conexão não encontrada." });
  }

  const webhook = await configureEvolutionWebhook(
    connection.instance_name,
    `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/evolution/webhook`,
    env.EVOLUTION_WEBHOOK_SECRET,
  );
  if (!webhook.ok) {
    const message = `Webhook: ${webhook.error}`;
    await service.from("whatsapp_connections").update({ last_error: message }).eq("id", connection.id);
    return setupState(connection, { ok: false, message });
  }

  const reconciliation = await reconcileWhatsAppConnection(service, connection);
  const { data: refreshed } = await service
    .from("whatsapp_connections")
    .select("status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .eq("id", connection.id)
    .single();
  revalidatePath("/configuracoes");
  revalidatePath("/whatsapp");
  return setupState(refreshed ?? connection, {
    ok: reconciliation.ok,
    message: reconciliation.ok
      ? `Integração reconfigurada e ${reconciliation.checked} mensagem(ns) recentes verificadas.`
      : reconciliation.error,
  });
}

export async function syncCompanyWhatsAppAction(): Promise<WhatsAppSetupState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) return setupState(null, { ok: false, message: "Acesso restrito ao administrador." });
  const service = createServiceRoleClient();
  const { data: connection, error } = await service
    .from("whatsapp_connections")
    .select("*")
    .eq("company_id", access.company.companyId)
    .limit(1)
    .maybeSingle();
  if (error || !connection) {
    return setupState(null, { ok: false, message: error?.message ?? "Conexão não encontrada." });
  }

  const reconciliation = await reconcileWhatsAppConnection(service, connection);
  const { data: refreshed } = await service
    .from("whatsapp_connections")
    .select("status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .eq("id", connection.id)
    .single();
  revalidatePath("/configuracoes");
  revalidatePath("/whatsapp");
  return setupState(refreshed ?? connection, {
    ok: reconciliation.ok,
    message: reconciliation.ok
      ? `${reconciliation.checked} mensagem(ns) recentes verificadas.`
      : reconciliation.error,
  });
}

export async function disconnectCompanyWhatsAppAction(): Promise<WhatsAppSetupState> {
  const access = await requireWhatsAppManager();
  if (!access.allowed) return setupState(null, { ok: false, message: "Acesso restrito ao administrador." });
  const supabase = await createServerSupabaseClient();
  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select("id, instance_name, status, phone_number, last_connected_at, last_event_at, last_sync_at, last_error")
    .eq("company_id", access.company.companyId)
    .limit(1)
    .maybeSingle();
  if (error || !connection) return setupState(null, { ok: false, message: error?.message ?? "Conexão não encontrada." });
  const currentState = await getEvolutionConnectionState(connection.instance_name);
  if (!currentState.ok && !missingEvolutionInstance(currentState.error)) {
    return setupState(connection, { ok: false, status: "error", message: currentState.error });
  }
  if (currentState.ok && currentState.state !== "disconnected") {
    const result = await logoutEvolutionInstance(connection.instance_name);
    if (!result.ok) return setupState(connection, { ok: false, status: "error", message: result.error });
  }
  const { error: updateError } = await supabase
    .from("whatsapp_connections")
    .update({ status: "disconnected", phone_number: null, last_error: null })
    .eq("id", connection.id);
  if (updateError) return setupState(connection, { ok: false, status: "error", message: updateError.message });
  revalidatePath("/configuracoes");
  revalidatePath("/whatsapp");
  return setupState(connection, { ok: true, status: "disconnected", phone: null, message: "WhatsApp desconectado. O histórico foi preservado." });
}

export async function verifyWhatsAppConnectionAction() {
  const result = await checkCompanyWhatsAppAction();
  if (!result.ok) fail(result.message ?? "Não foi possível verificar a conexão.");
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
  const result = await ensureConversation(company.companyId, contactId.data, roundId.data ?? null);
  if (!result.ok) fail(result.error);
  redirect(whatsappUrl({ conversa: result.conversationId }));
}
