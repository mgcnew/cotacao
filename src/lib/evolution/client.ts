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

export async function sendWhatsAppText(
  phone: string,
  text: string,
): Promise<EvolutionResult> {
  const env = getServerEnv();

  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) {
    return { ok: false, error: "Evolution não está configurada no servidor." };
  }

  const url = `${env.EVOLUTION_API_URL.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: phone, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    const motivo =
      cause instanceof Error && cause.name === "TimeoutError"
        ? `A Evolution não respondeu em ${TIMEOUT_MS / 1000}s.`
        : cause instanceof Error
          ? cause.message
          : "Falha de rede ao falar com a Evolution.";
    return { ok: false, error: motivo };
  }

  const corpo = await response.text();

  if (!response.ok) {
    // O corpo do erro da Evolution costuma trazer a razão real (número
    // inválido, instância desconectada). Truncado para não inundar o log.
    return {
      ok: false,
      error: `Evolution respondeu ${response.status}: ${corpo.slice(0, 300)}`,
    };
  }

  // O id externo é o que permite casar este envio com um webhook de entrega
  // depois. Se o formato mudar, o envio continua válido — só fica sem rastro.
  let externalMessageId: string | null = null;
  try {
    const json = JSON.parse(corpo) as {
      key?: { id?: string };
      messageId?: string;
    };
    externalMessageId = json.key?.id ?? json.messageId ?? null;
  } catch {
    externalMessageId = null;
  }

  return { ok: true, externalMessageId };
}
