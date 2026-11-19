import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOrderReminderMessage, normalizePhone } from "@/features/orders/message";
import { isOrderReminderBusinessTime, stillAwaitingOrderConfirmation } from "@/features/orders/reminder-rules";
import { publicEnv } from "@/lib/env";
import { sendWhatsAppText } from "@/lib/evolution/client";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;
type Reminder = Database["public"]["Tables"]["order_confirmation_reminders"]["Row"];

async function updateReminder(client: Client, reminder: Reminder, values: Database["public"]["Tables"]["order_confirmation_reminders"]["Update"]) {
  const { error } = await client.from("order_confirmation_reminders").update(values)
    .eq("company_id", reminder.company_id).eq("id", reminder.id);
  if (error) throw new Error(error.message);
}

async function processReminder(client: Client, reminder: Reminder): Promise<"sent" | "skipped" | "pending" | "failed"> {
  let logId: string | null = null;
  try {
    const [source, revision, connection, company] = await Promise.all([
      client.from("communication_logs").select("supplier_id, supplier_contact_id")
        .eq("company_id", reminder.company_id).eq("id", reminder.source_communication_id).single(),
      client.from("order_revisions")
        .select("id, order_id, status, revision_number, orders!order_revisions_company_id_order_id_fkey (id, supplier_id, order_number, status, current_revision_id, suppliers (name))")
        .eq("company_id", reminder.company_id).eq("id", reminder.order_revision_id).single(),
      client.from("whatsapp_connections").select("instance_name, status")
        .eq("company_id", reminder.company_id).limit(1).maybeSingle(),
      client.from("companies").select("name, legal_name").eq("id", reminder.company_id).single(),
    ]);
    for (const result of [source, revision, connection, company]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (!source.data || !revision.data?.orders || !company.data) throw new Error("Dados do pedido não encontrados.");
    const order = revision.data.orders;
    if (!stillAwaitingOrderConfirmation({ status: order.status, currentRevisionId: order.current_revision_id }, revision.data)) {
      await updateReminder(client, reminder, { status: "skipped" });
      return "skipped";
    }
    if (!connection.data || connection.data.status !== "connected" || !isOrderReminderBusinessTime(new Date())) {
      await updateReminder(client, reminder, { status: "pending", claimed_at: null });
      return "pending";
    }
    const { data: contact, error: contactError } = await client.from("supplier_contacts")
      .select("whatsapp").eq("company_id", reminder.company_id)
      .eq("id", source.data.supplier_contact_id ?? "")
      .eq("supplier_id", order.supplier_id).eq("is_active", true).maybeSingle();
    if (contactError) throw new Error(contactError.message);
    const phone = normalizePhone(contact?.whatsapp);
    if (!phone || source.data.supplier_id !== order.supplier_id) throw new Error("Contato original indisponível ou sem WhatsApp válido.");

    // Emite outro link para a mesma revisão; o link inicial continua válido.
    const token = randomBytes(16).toString("base64url");
    const { error: tokenError } = await client.rpc("rpc_service_store_public_token", {
      p_company_id: reminder.company_id, p_purpose: "order_confirmation",
      p_supplier_id: order.supplier_id, p_order_revision_id: reminder.order_revision_id,
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (tokenError) throw new Error(tokenError.message);
    const message = buildOrderReminderMessage({
      orderNumber: order.order_number, companyName: company.data.legal_name ?? company.data.name,
      supplierName: order.suppliers?.name ?? "Fornecedor", revisionNumber: revision.data.revision_number,
    }, `${publicEnv.NEXT_PUBLIC_APP_URL}/o/${token}`);

    // Releitura imediatamente antes do envio: a confirmação pode ter ocorrido
    // enquanto buscávamos o contato e emitíamos o link.
    const [currentOrder, currentRevision] = await Promise.all([
      client.from("orders").select("status, current_revision_id")
        .eq("company_id", reminder.company_id).eq("id", order.id).single(),
      client.from("order_revisions").select("id, status")
        .eq("company_id", reminder.company_id).eq("id", reminder.order_revision_id).single(),
    ]);
    if (currentOrder.error) throw new Error(currentOrder.error.message);
    if (currentRevision.error) throw new Error(currentRevision.error.message);
    if (!stillAwaitingOrderConfirmation({ status: currentOrder.data.status, currentRevisionId: currentOrder.data.current_revision_id }, currentRevision.data)) {
      await updateReminder(client, reminder, { status: "skipped" });
      return "skipped";
    }
    if (!isOrderReminderBusinessTime(new Date())) {
      await updateReminder(client, reminder, { status: "pending", claimed_at: null });
      return "pending";
    }
    const { data: log, error: logError } = await client.from("communication_logs").insert({
      company_id: reminder.company_id, supplier_id: order.supplier_id,
      supplier_contact_id: source.data.supplier_contact_id, order_revision_id: reminder.order_revision_id,
      channel: "whatsapp", provider: "evolution", direction: "outbound", status: "queued",
      message_kind: "order_confirmation_reminder", message_body: message,
    }).select("id").single();
    if (logError) throw new Error(logError.message);
    logId = log.id;
    await updateReminder(client, reminder, { communication_log_id: logId });

    const result = await sendWhatsAppText(phone, message, connection.data.instance_name);
    const { error: logUpdateError } = await client.rpc("rpc_service_update_communication_log", {
      p_company_id: reminder.company_id, p_communication_log_id: logId,
      p_status: result.ok ? "sent" : "failed",
      p_external_message_id: result.ok ? result.externalMessageId ?? undefined : undefined,
      p_error_message: result.ok ? undefined : result.error,
    });
    if (logUpdateError) throw new Error(logUpdateError.message);
    await updateReminder(client, reminder, {
      status: result.ok ? "sent" : "failed", sent_at: result.ok ? new Date().toISOString() : null,
      error_message: result.ok ? null : result.error,
    });
    return result.ok ? "sent" : "failed";
  } catch (cause) {
    console.error("[order-reminders] Falha no lembrete", reminder.id, cause);
    await updateReminder(client, reminder, {
      status: "failed", communication_log_id: logId,
      error_message: "Não foi possível concluir o lembrete. Confira a conversa antes de reenviar.",
    });
    return "failed";
  }
}

export async function processOrderConfirmationReminders(client: Client) {
  const { data, error } = await client.rpc("rpc_service_claim_order_confirmation_reminders", { p_limit: 10 });
  if (error) throw new Error(error.message);
  const results: PromiseSettledResult<Awaited<ReturnType<typeof processReminder>>>[] = [];
  // Limita chamadas simultâneas ao provedor e conclui até 10 lembretes por rodada.
  for (let offset = 0; offset < (data?.length ?? 0); offset += 5) {
    results.push(...await Promise.allSettled(data!.slice(offset, offset + 5).map((reminder) => processReminder(client, reminder))));
  }
  return {
    claimed: data?.length ?? 0,
    sent: results.filter((result) => result.status === "fulfilled" && result.value === "sent").length,
    failed: results.filter((result) => result.status === "rejected" || result.value === "failed").length,
  };
}
