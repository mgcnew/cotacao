import "server-only";

import { getServerEnv } from "@/lib/env";

/**
 * Evolution API — envio de WhatsApp.
 *
 * A integração é opcional por desenho: o documento mestre (seção 9) separa o
 * pedido da comunicação, e o sistema tem que funcionar inteiro com o envio na
 * mão. Sem as três variáveis de ambiente, `isConfigured()` responde `false` e
 * a interface simplesmente não oferece o envio automático.
 *
 * Nada aqui lança: quem chama precisa saber o que deu errado para registrar a
 * falha em `communication_logs` — e uma exceção viraria erro 500 em vez de
 * linha no histórico.
 */

export type EvolutionResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; error: string };

/** As três variáveis, ou nada. Meia configuração é configuração quebrada. */
export function isEvolutionConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE,
  );
}

/** Timeout curto: quem está esperando é uma pessoa olhando para a tela. */
const TIMEOUT_MS = 15_000;

async function evolutionRequest(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const env = getServerEnv();
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    return { ok: false, error: "Evolution não está configurada no servidor." };
  }

  try {
    const response = await fetch(
      `${env.EVOLUTION_API_URL.replace(/\/+$/, "")}${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          apikey: env.EVOLUTION_API_KEY,
          ...init.headers,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: `Evolution respondeu ${response.status}: ${body.slice(0, 300)}`,
      };
    }
    if (!body) return { ok: true, data: null };
    try {
      return { ok: true, data: JSON.parse(body) as unknown };
    } catch {
      return { ok: true, data: body };
    }
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === "TimeoutError"
        ? `A Evolution não respondeu em ${TIMEOUT_MS / 1000}s.`
        : cause instanceof Error
          ? cause.message
          : "Falha de rede ao falar com a Evolution.";
    return { ok: false, error: reason };
  }
}

export async function sendWhatsAppText(
  phone: string,
  text: string,
  instance?: string,
): Promise<EvolutionResult> {
  const env = getServerEnv();

  const selectedInstance = instance ?? env.EVOLUTION_INSTANCE;
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !selectedInstance) {
    return { ok: false, error: "Evolution não está configurada no servidor." };
  }

  const result = await evolutionRequest(
    `/message/sendText/${encodeURIComponent(selectedInstance)}`,
    { method: "POST", body: JSON.stringify({ number: phone, text }) },
  );
  if (!result.ok) return result;

  // O id externo é o que permite casar este envio com um webhook de entrega
  // depois. Se o formato mudar, o envio continua válido — só fica sem rastro.
  let externalMessageId: string | null = null;
  try {
    const json = result.data as {
      key?: { id?: string };
      messageId?: string;
    };
    externalMessageId = json.key?.id ?? json.messageId ?? null;
  } catch {
    externalMessageId = null;
  }

  return { ok: true, externalMessageId };
}

export type EvolutionConnectionState =
  | { ok: true; state: "connected" | "connecting" | "disconnected" | "unknown"; phone: string | null }
  | { ok: false; error: string };

export async function getEvolutionConnectionState(
  instance?: string,
): Promise<EvolutionConnectionState> {
  const env = getServerEnv();
  const selectedInstance = instance ?? env.EVOLUTION_INSTANCE;
  if (!selectedInstance) {
    return { ok: false, error: "Instância da Evolution não configurada." };
  }
  const result = await evolutionRequest(
    `/instance/connectionState/${encodeURIComponent(selectedInstance)}`,
  );
  if (!result.ok) return result;

  const data = result.data as {
    instance?: { state?: string; ownerJid?: string };
    state?: string;
  } | null;
  const raw = String(data?.instance?.state ?? data?.state ?? "unknown").toLowerCase();
  const state = raw === "open" || raw === "connected"
    ? "connected"
    : raw === "connecting"
      ? "connecting"
      : raw === "close" || raw === "disconnected"
        ? "disconnected"
        : "unknown";
  const phone = data?.instance?.ownerJid?.split("@")[0]?.replace(/\D/g, "") ?? null;
  return { ok: true, state, phone };
}

export async function findEvolutionMessages(
  instance: string,
  remoteJid?: string,
  limit = 50,
) {
  return evolutionRequest(
    `/chat/findMessages/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(remoteJid ? { where: { key: { remoteJid } } } : {}),
        limit: Math.max(1, Math.min(limit, 100)),
      }),
    },
  );
}

export async function configureEvolutionWebhook(
  instance: string,
  url: string,
  secret: string,
) {
  return evolutionRequest(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        headers: { "x-webhook-secret": secret },
        byEvents: false,
        base64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "SEND_MESSAGE_UPDATE",
          "CONNECTION_UPDATE",
        ],
      },
    }),
  });
}
