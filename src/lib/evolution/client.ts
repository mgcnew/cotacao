import "server-only";

import { getServerEnv } from "@/lib/env";

/**
 * Evolution API — provisionamento e envio de WhatsApp.
 *
 * A integração é opcional por desenho: o documento mestre (seção 9) separa o
 * pedido da comunicação, e o sistema tem que funcionar inteiro com o envio na
 * mão. Sem as credenciais do provedor, `isEvolutionConfigured()` responde
 * `false` e a interface não oferece o envio automático.
 *
 * Nada aqui lança: quem chama precisa saber o que deu errado para registrar a
 * falha em `communication_logs` — e uma exceção viraria erro 500 em vez de
 * linha no histórico.
 */

export type EvolutionResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; error: string };

/** A instância é escolhida por empresa e, portanto, não vive mais no ambiente. */
export function isEvolutionConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY);
}

export function isEvolutionProvisioningConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.EVOLUTION_API_URL &&
      env.EVOLUTION_API_KEY &&
      env.EVOLUTION_WEBHOOK_SECRET,
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
  instance: string,
): Promise<EvolutionResult> {
  const env = getServerEnv();

  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !instance) {
    return { ok: false, error: "Evolution não está configurada no servidor." };
  }

  const result = await evolutionRequest(
    `/message/sendText/${encodeURIComponent(instance)}`,
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
  instance: string,
): Promise<EvolutionConnectionState> {
  if (!instance) {
    return { ok: false, error: "Instância da Evolution não configurada." };
  }
  const result = await evolutionRequest(
    `/instance/connectionState/${encodeURIComponent(instance)}`,
  );
  if (!result.ok) return result;

  const data = result.data as {
    error?: boolean;
    message?: string;
    instance?: { state?: string; ownerJid?: string };
    state?: string;
  } | null;
  if (data?.error) {
    return { ok: false, error: data.message ?? "A instância não foi encontrada na Evolution." };
  }
  const raw = String(data?.instance?.state ?? data?.state ?? "unknown").toLowerCase();
  const state = raw === "open" || raw === "connected"
    ? "connected"
    : raw === "connecting"
      ? "connecting"
      : raw === "close" || raw === "disconnected"
        ? "disconnected"
        : "unknown";
  let phone = data?.instance?.ownerJid?.split("@")[0]?.replace(/\D/g, "") ?? null;
  if (state === "connected" && !phone) {
    const info = await evolutionRequest(
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
    );
    if (info.ok) phone = findOwnerPhone(info.data);
  }
  return { ok: true, state, phone };
}

export type EvolutionConnectResult =
  | { ok: true; qrCode: string | null }
  | { ok: false; error: string };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findOwnerPhone(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const phone = findOwnerPhone(item);
      if (phone) return phone;
    }
    return null;
  }
  const record = object(value);
  if (!record) return null;
  for (const key of ["ownerJid", "owner", "number"]) {
    if (typeof record[key] === "string") {
      const phone = record[key].split("@")[0].replace(/\D/g, "");
      if (phone.length >= 8) return phone;
    }
  }
  for (const child of Object.values(record)) {
    const phone = findOwnerPhone(child);
    if (phone) return phone;
  }
  return null;
}

function findQrImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findQrImage(item);
      if (image) return image;
    }
    return null;
  }
  const record = object(value);
  if (!record) return null;
  for (const key of ["base64", "base64Qr", "qrCodeBase64"]) {
    const candidate = record[key];
    if (typeof candidate !== "string" || candidate.length < 100) continue;
    return candidate.startsWith("data:image/")
      ? candidate
      : `data:image/png;base64,${candidate}`;
  }
  for (const child of Object.values(record)) {
    const image = findQrImage(child);
    if (image) return image;
  }
  return null;
}

export async function createEvolutionInstance(instance: string) {
  const result = await evolutionRequest("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: false,
    }),
  });
  if (!result.ok) return result;
  const data = object(result.data);
  if (data?.error) {
    return { ok: false as const, error: String(data.message ?? "Não foi possível criar a instância.") };
  }
  return { ok: true as const };
}

export async function connectEvolutionInstance(
  instance: string,
): Promise<EvolutionConnectResult> {
  const result = await evolutionRequest(
    `/instance/connect/${encodeURIComponent(instance)}`,
  );
  if (!result.ok) return result;
  const data = object(result.data);
  if (data?.error) {
    return { ok: false, error: String(data.message ?? "Não foi possível iniciar a conexão.") };
  }
  return { ok: true, qrCode: findQrImage(result.data) };
}

export async function logoutEvolutionInstance(instance: string) {
  return evolutionRequest(`/instance/logout/${encodeURIComponent(instance)}`, {
    method: "DELETE",
  });
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
