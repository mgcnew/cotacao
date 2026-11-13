import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { publicEnv } from "@/lib/env";
import { normalizeWhatsAppPhone } from "@/features/whatsapp/normalize";
import {
  itemCountLabel,
  renderWhatsAppTemplate,
} from "@/features/whatsapp/message-templates";
import { getCompanyWhatsAppTemplates } from "@/features/whatsapp/templates";
import { sendWhatsAppText } from "@/lib/evolution/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * O envio da cotação a UM fornecedor, sem a casca de Server Action.
 *
 * As actions de `send.ts` (um fornecedor por vez, pelo formulário) e a rota
 * de envio em lote (`/api/compras/[id]/envio`, que a tela chama fornecedor
 * por fornecedor) usam estas funções, para o lote não virar uma segunda
 * versão do envio. A autorização — empresa ativa e `purchase_round.send` —
 * fica com quem chama; aqui só se confere que o fornecedor é da empresa,
 * pela leitura com o client do usuário (RLS).
 */

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type EnvioContexto = {
  companyId: string;
  companyName: string;
  supabase: Supabase;
};

export type ResultadoEnvio =
  { ok: true; aviso?: string } | { ok: false; error: string; url?: string };

/** Token bruto: 16 bytes (128 bits) em base64url, 22 caracteres no link. */
function newRawToken(): string {
  return randomBytes(16).toString("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueQuotationLink(params: {
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
  if (error)
    return {
      ok: false as const,
      error: `Não foi possível gerar o link: ${error.message}`,
    };
  return {
    ok: true as const,
    url: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/q/${rawToken}`,
  };
}

async function writeCommunicationLog(params: {
  companyId: string;
  supplierId: string;
  contactId: string;
  roundSupplierId: string;
  messageKind: "quotation_invitation" | "quotation_reminder";
  messageBody: string;
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
        message_kind: params.messageKind,
        message_body: params.messageBody,
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
    console.error(
      "[finishCommunicationLog] não foi possível atualizar:",
      cause,
    );
  }
}

/**
 * Fornecedor da rodada com o que a mensagem precisa. `roundId`, quando vem,
 * prende a leitura àquela rodada: a rota de lote recebe o id da URL e não
 * deve agir em fornecedor de outra.
 */
async function carregarFornecedor(
  ctx: EnvioContexto,
  roundSupplierId: string,
  roundId?: string,
) {
  let query = ctx.supabase
    .from("round_suppliers")
    .select(
      `
      id,
      supplier_id,
      supplier_contact_id,
      purchase_round_id,
      first_sent_at,
      completed_at,
      removed_at,
      suppliers!inner ( name ),
      supplier_contacts ( id, name, whatsapp ),
      purchase_rounds!inner ( title, status ),
      supplier_quotation_items ( id, removed_at )
    `,
    )
    .eq("company_id", ctx.companyId)
    .eq("id", roundSupplierId);
  if (roundId) query = query.eq("purchase_round_id", roundId);
  const { data, error } = await query.maybeSingle();
  if (error)
    return {
      ok: false as const,
      error: `Falha ao carregar o fornecedor: ${error.message}`,
    };
  if (!data || data.removed_at)
    return {
      ok: false as const,
      error: "Fornecedor não encontrado nesta rodada.",
    };
  const itemCount =
    data.supplier_quotation_items?.filter((item) => item.removed_at === null)
      .length ?? 0;
  return { ok: true as const, fornecedor: data, itemCount };
}

type Fornecedor = Extract<
  Awaited<ReturnType<typeof carregarFornecedor>>,
  { ok: true }
>["fornecedor"];

async function conexaoAtiva(ctx: EnvioContexto) {
  const { data: connection } = await ctx.supabase
    .from("whatsapp_connections")
    .select("id, instance_name, status")
    .eq("company_id", ctx.companyId)
    .limit(1)
    .maybeSingle();
  return connection && connection.status === "connected" ? connection : null;
}

/** A conversa do contato passa a apontar para esta rodada, para a resposta cair no lugar certo. */
async function vincularConversa(
  ctx: EnvioContexto,
  connectionId: string,
  fornecedor: Fornecedor,
  contact: { id: string; name: string },
  phone: string,
) {
  const remoteJid = `${phone}@s.whatsapp.net`;
  const { data: conversation } = await ctx.supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (conversation) {
    await ctx.supabase
      .from("whatsapp_conversations")
      .update({
        supplier_id: fornecedor.supplier_id,
        supplier_contact_id: contact.id,
        purchase_round_id: fornecedor.purchase_round_id,
        display_name: contact.name,
      })
      .eq("id", conversation.id);
  } else {
    await ctx.supabase.from("whatsapp_conversations").insert({
      company_id: ctx.companyId,
      connection_id: connectionId,
      supplier_id: fornecedor.supplier_id,
      supplier_contact_id: contact.id,
      purchase_round_id: fornecedor.purchase_round_id,
      remote_jid: remoteJid,
      normalized_phone: phone,
      display_name: contact.name,
    });
  }
}

/** Marca o envio pela RPC, que também ativa a rodada e abre os grupos. */
export async function marcarEnviado(
  ctx: EnvioContexto,
  roundSupplierId: string,
) {
  const { error } = await ctx.supabase.rpc("rpc_mark_round_supplier_sent", {
    p_company_id: ctx.companyId,
    p_round_supplier_id: roundSupplierId,
  });
  return error;
}

/**
 * Convite (primeiro envio) ou cobrança, pelo WhatsApp da empresa.
 *
 * A cobrança só sai para quem já recebeu, não concluiu e não foi cobrado nas
 * últimas 2 horas — a mesma regra de antes, agora conferida por fornecedor.
 */
export async function enviarPeloWhatsApp(
  ctx: EnvioContexto,
  params: {
    roundSupplierId: string;
    roundId?: string;
    tipo: "convite" | "cobranca";
  },
): Promise<ResultadoEnvio> {
  const carregado = await carregarFornecedor(
    ctx,
    params.roundSupplierId,
    params.roundId,
  );
  if (!carregado.ok) return carregado;
  const { fornecedor, itemCount } = carregado;

  const connection = await conexaoAtiva(ctx);
  if (!connection) {
    return {
      ok: false,
      error:
        "O WhatsApp da empresa não está conectado. Abra Configurações para conectar.",
    };
  }
  const contact = fornecedor.supplier_contacts;
  const phone = normalizeWhatsAppPhone(contact?.whatsapp);
  if (!contact || !fornecedor.supplier_contact_id || !phone) {
    return {
      ok: false,
      error: "O contato escolhido não tem um WhatsApp válido.",
    };
  }
  if (!itemCount)
    return {
      ok: false,
      error: "Nenhum grupo com produtos para este fornecedor.",
    };

  if (params.tipo === "cobranca") {
    if (fornecedor.purchase_rounds.status !== "active")
      return { ok: false, error: "A rodada não está em andamento." };
    if (!fornecedor.first_sent_at)
      return { ok: false, error: "Ainda não recebeu a cotação." };
    if (fornecedor.completed_at)
      return { ok: false, error: "Já concluiu a resposta." };
    const recentSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { count, error } = await ctx.supabase
      .from("communication_logs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", ctx.companyId)
      .eq("message_kind", "quotation_reminder")
      .in("status", ["queued", "sent", "delivered"])
      .gte("created_at", recentSince)
      .eq("round_supplier_id", fornecedor.id);
    if (error)
      return {
        ok: false,
        error: `Não foi possível conferir cobranças recentes: ${error.message}`,
      };
    if (count)
      return { ok: false, error: "Já foi cobrado há menos de 2 horas." };
  }

  const link = await issueQuotationLink({
    companyId: ctx.companyId,
    supplierId: fornecedor.supplier_id,
    roundSupplierId: fornecedor.id,
  });
  if (!link.ok) return { ok: false, error: link.error };

  const templates = await getCompanyWhatsAppTemplates(ctx.companyId);
  const message = renderWhatsAppTemplate(
    params.tipo === "convite"
      ? templates.quotation_invitation
      : templates.quotation_reminder,
    {
      contato: contact.name,
      empresa: ctx.companyName,
      cotacao: fornecedor.purchase_rounds.title,
      quantidade_itens: itemCountLabel(itemCount),
      link: link.url,
    },
  );
  await vincularConversa(ctx, connection.id, fornecedor, contact, phone);

  const logId = await writeCommunicationLog({
    companyId: ctx.companyId,
    supplierId: fornecedor.supplier_id,
    contactId: contact.id,
    roundSupplierId: fornecedor.id,
    messageKind:
      params.tipo === "convite" ? "quotation_invitation" : "quotation_reminder",
    messageBody: message,
  });
  const result = await sendWhatsAppText(
    phone,
    message,
    connection.instance_name,
  );
  await finishCommunicationLog(ctx.companyId, logId, result);
  if (!result.ok) {
    return {
      ok: false,
      error: `Não foi possível enviar pelo WhatsApp: ${result.error}. O link continua disponível para envio manual.`,
      url: link.url,
    };
  }

  if (params.tipo === "convite") {
    const markError = await marcarEnviado(ctx, fornecedor.id);
    if (markError) {
      return {
        ok: true,
        aviso: `A mensagem foi enviada, mas o registro da rodada falhou: ${markError.message}`,
      };
    }
  }
  return { ok: true };
}

/**
 * Link novo com a mensagem pronta, para quem manda pelo próprio celular.
 * Não marca como enviado: só quem manda sabe se a mensagem saiu.
 */
export async function gerarLinkComMensagem(
  ctx: EnvioContexto,
  params: { roundSupplierId: string; roundId?: string },
) {
  const carregado = await carregarFornecedor(
    ctx,
    params.roundSupplierId,
    params.roundId,
  );
  if (!carregado.ok) return carregado;
  const { fornecedor, itemCount } = carregado;
  if (!itemCount)
    return {
      ok: false as const,
      error: "Nenhum grupo com produtos para este fornecedor.",
    };

  const link = await issueQuotationLink({
    companyId: ctx.companyId,
    supplierId: fornecedor.supplier_id,
    roundSupplierId: fornecedor.id,
  });
  if (!link.ok) return { ok: false as const, error: link.error };

  const templates = await getCompanyWhatsAppTemplates(ctx.companyId);
  const contact = fornecedor.supplier_contacts;
  const message = renderWhatsAppTemplate(
    fornecedor.first_sent_at
      ? templates.quotation_reminder
      : templates.quotation_invitation,
    {
      contato: contact?.name ?? "fornecedor",
      empresa: ctx.companyName,
      cotacao: fornecedor.purchase_rounds.title,
      quantidade_itens: itemCountLabel(itemCount),
      link: link.url,
    },
  );
  return {
    ok: true as const,
    url: link.url,
    message,
    phone: normalizeWhatsAppPhone(contact?.whatsapp),
  };
}
