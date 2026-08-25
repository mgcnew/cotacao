"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { publicEnv } from "@/lib/env";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import { sendWhatsAppText } from "@/lib/evolution/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Envio da cotação ao fornecedor.
 *
 * O fluxo é o do RPC_FLOW: o backend gera o token bruto, guarda APENAS o
 * SHA-256, monta a URL, e só marca como enviado depois que a comunicação
 * realmente saiu. Enquanto a Evolution não está configurada, "comunicação"
 * é o comprador copiar o link e mandar — o documento prevê esse caminho
 * manual, e ele mantém o registro honesto.
 */

export type SendState = {
  error: string | null;
  /** Link recém-gerado, mostrado uma única vez. */
  url?: string;
  savedAt?: number;
  sent?: boolean;
};

/** Token bruto: 32 bytes de aleatoriedade criptográfica, em base64url. */
function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function issueQuotationLink(params: {
  companyId: string;
  supplierId: string;
  roundSupplierId: string;
}) {
  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (cause) {
    console.error("[issueQuotationLink] service role indisponível:", cause);
    return {
      ok: false as const,
      error: "O servidor está sem a chave de administração do Supabase.",
    };
  }

  const rawToken = newRawToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { error } = await service.rpc("rpc_service_store_public_token", {
    p_company_id: params.companyId,
    p_purpose: "quotation_response",
    p_supplier_id: params.supplierId,
    p_round_supplier_id: params.roundSupplierId,
    p_token_hash: sha256Hex(rawToken),
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) return { ok: false as const, error: `Não foi possível gerar o link: ${error.message}` };
  return {
    ok: true as const,
    url: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/q/${rawToken}`,
  };
}

function buildQuotationMessage(params: {
  contactName: string;
  companyName: string;
  roundTitle: string;
  itemCount: number;
  url: string;
}) {
  const items = `${params.itemCount} ${params.itemCount === 1 ? "produto" : "produtos"}`;
  return [
    `Olá, ${params.contactName}!`,
    "",
    `${params.companyName} convida você para responder à cotação “${params.roundTitle}”, com ${items}.`,
    "",
    `Acesse o link para informar preços e condições: ${params.url}`,
    "",
    "Se precisar, pode responder por aqui.",
  ].join("\n");
}

async function writeCommunicationLog(params: {
  companyId: string;
  supplierId: string;
  contactId: string;
  roundSupplierId: string;
}) {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("communication_logs")
      .insert({
        company_id: params.companyId,
        supplier_id: params.supplierId,
        supplier_contact_id: params.contactId,
        round_supplier_id: params.roundSupplierId,
        channel: "whatsapp",
        provider: "evolution",
        status: "queued",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (cause) {
    console.error("[writeCommunicationLog] não foi possível registrar:", cause);
    return null;
  }
}

async function finishCommunicationLog(
  companyId: string,
  logId: string | null,
  result:
    | { ok: true; externalMessageId: string | null }
    | { ok: false; error: string },
) {
  if (!logId) return;
  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("communication_logs")
      .update({
        status: result.ok ? "sent" : "failed",
        external_message_id: result.ok ? result.externalMessageId : null,
        error_message: result.ok ? null : result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("company_id", companyId)
      .eq("id", logId);
    if (error) throw error;
  } catch (cause) {
    console.error("[finishCommunicationLog] não foi possível atualizar:", cause);
  }
}

/**
 * Gera o link público de um fornecedor da rodada.
 *
 * `rpc_service_store_public_token` roda como service_role e NÃO faz checagem
 * de permissão por dentro — ela confia em quem chama. Então a autorização é
 * feita aqui, e é obrigatória:
 *  1. o usuário precisa de `purchase_round.send` na empresa ativa;
 *  2. o round_supplier precisa ser da empresa ativa — confirmado por leitura
 *     com o client normal, ou seja, passando pela RLS.
 *
 * O token bruto só existe nesta função e na resposta. O banco guarda o hash.
 */
export async function generateQuotationLink(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("purchase_round.send")) {
    return { error: "Seu papel não permite enviar cotações." };
  }

  const roundSupplierId = String(formData.get("roundSupplierId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");

  // Leitura com o client do usuário: se a RLS não devolver a linha, o
  // fornecedor não é desta empresa e a geração para aqui.
  const supabase = await createServerSupabaseClient();
  const { data: roundSupplier, error: readError } = await supabase
    .from("round_suppliers")
    .select("id, supplier_id, purchase_round_id, removed_at")
    .eq("company_id", company.companyId)
    .eq("id", roundSupplierId)
    .maybeSingle();

  if (readError) {
    return { error: `Falha ao carregar o fornecedor: ${readError.message}` };
  }
  if (!roundSupplier) {
    return { error: "Fornecedor não encontrado nesta rodada." };
  }
  if (roundSupplier.removed_at) {
    return { error: "Este fornecedor foi retirado da rodada." };
  }

  const { count: activeItems, error: itemsError } = await supabase
    .from("supplier_quotation_items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("round_supplier_id", roundSupplier.id)
    .is("removed_at", null);

  if (itemsError) {
    return { error: `Falha ao conferir os produtos: ${itemsError.message}` };
  }
  if (!activeItems) {
    return { error: "Escolha ao menos um grupo com produtos antes de gerar o link." };
  }

  const link = await issueQuotationLink({
    companyId: company.companyId,
    supplierId: roundSupplier.supplier_id,
    roundSupplierId: roundSupplier.id,
  });
  if (!link.ok) return { error: link.error };

  revalidatePath(`/compras/${roundId}`);

  return {
    error: null,
    savedAt: Date.now(),
    url: link.url,
  };
}

/** Gera o link, envia ao contato escolhido e registra o ciclo da comunicação. */
export async function sendQuotationWhatsApp(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("purchase_round.send")) {
    return { error: "Seu papel não permite enviar cotações." };
  }

  const roundSupplierId = String(formData.get("roundSupplierId") ?? "");
  if (!roundSupplierId) return { error: "Fornecedor inválido." };

  const supabase = await createServerSupabaseClient();
  const [{ data: roundSupplier, error: supplierError }, { data: connection }] = await Promise.all([
    supabase
      .from("round_suppliers")
      .select(`
        id,
        supplier_id,
        supplier_contact_id,
        purchase_round_id,
        removed_at,
        suppliers!inner ( name ),
        supplier_contacts ( id, name, whatsapp ),
        purchase_rounds!inner ( title )
      `)
      .eq("company_id", company.companyId)
      .eq("id", roundSupplierId)
      .maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id, instance_name, status")
      .eq("company_id", company.companyId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (supplierError) return { error: `Falha ao carregar o fornecedor: ${supplierError.message}` };
  if (!roundSupplier || roundSupplier.removed_at) return { error: "Fornecedor não encontrado nesta rodada." };
  if (!connection || connection.status !== "connected") {
    return { error: "O WhatsApp da empresa não está conectado. Abra Configurações para conectar." };
  }
  const contact = roundSupplier.supplier_contacts;
  const phone = normalizeWhatsAppPhone(contact?.whatsapp);
  if (!contact || !roundSupplier.supplier_contact_id || !phone) {
    return { error: "O contato escolhido para este fornecedor não possui um WhatsApp válido." };
  }

  const { count: itemCount, error: itemsError } = await supabase
    .from("supplier_quotation_items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("round_supplier_id", roundSupplier.id)
    .is("removed_at", null);
  if (itemsError) return { error: `Falha ao conferir os produtos: ${itemsError.message}` };
  if (!itemCount) return { error: "Escolha ao menos um grupo com produtos antes de enviar." };

  const link = await issueQuotationLink({
    companyId: company.companyId,
    supplierId: roundSupplier.supplier_id,
    roundSupplierId: roundSupplier.id,
  });
  if (!link.ok) return { error: link.error };

  const message = buildQuotationMessage({
    contactName: contact.name,
    companyName: company.companyName,
    roundTitle: roundSupplier.purchase_rounds.title,
    itemCount,
    url: link.url,
  });
  const remoteJid = `${phone}@s.whatsapp.net`;
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (conversation) {
    await supabase.from("whatsapp_conversations").update({
      supplier_id: roundSupplier.supplier_id,
      supplier_contact_id: contact.id,
      purchase_round_id: roundSupplier.purchase_round_id,
      display_name: contact.name,
    }).eq("id", conversation.id);
  } else {
    await supabase.from("whatsapp_conversations").insert({
      company_id: company.companyId,
      connection_id: connection.id,
      supplier_id: roundSupplier.supplier_id,
      supplier_contact_id: contact.id,
      purchase_round_id: roundSupplier.purchase_round_id,
      remote_jid: remoteJid,
      normalized_phone: phone,
      display_name: contact.name,
    });
  }

  const logId = await writeCommunicationLog({
    companyId: company.companyId,
    supplierId: roundSupplier.supplier_id,
    contactId: contact.id,
    roundSupplierId: roundSupplier.id,
  });
  const result = await sendWhatsAppText(phone, message, connection.instance_name);
  await finishCommunicationLog(company.companyId, logId, result);
  if (!result.ok) {
    return {
      error: `Não foi possível enviar pelo WhatsApp: ${result.error}. O link continua disponível para envio manual.`,
      url: link.url,
    };
  }

  const { error: markError } = await supabase.rpc("rpc_mark_round_supplier_sent", {
    p_company_id: company.companyId,
    p_round_supplier_id: roundSupplier.id,
  });
  revalidatePath(`/compras/${roundSupplier.purchase_round_id}`);
  revalidatePath("/compras");
  revalidatePath("/whatsapp");
  if (markError) {
    return {
      error: `A mensagem foi enviada, mas o registro da rodada falhou: ${markError.message}`,
      sent: true,
      savedAt: Date.now(),
    };
  }
  return { error: null, sent: true, savedAt: Date.now() };
}

/**
 * Marca o fornecedor como enviado.
 *
 * Aqui usamos a RPC, que é onde o schema centralizou o efeito: além de gravar
 * `first_sent_at`, ela ativa a rodada, abre os grupos e emite o evento de
 * domínio `quotation.sent`. Fazer UPDATE direto pularia tudo isso.
 *
 * Devolve estado em vez de lançar: falha de envio é recado para quem enviou,
 * não motivo para perder a tela.
 */
export async function markSupplierSent(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const company = await requireActiveCompany();

  const roundSupplierId = String(formData.get("roundSupplierId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundSupplierId) return { error: "Fornecedor inválido." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_mark_round_supplier_sent", {
    p_company_id: company.companyId,
    p_round_supplier_id: roundSupplierId,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite enviar cotações." };
    }
    return { error: `Não foi possível marcar como enviado: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}
