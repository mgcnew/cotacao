import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { jidCanBeMatchedToPhone, normalizeWhatsAppPhone, phonesEquivalent } from "@/features/whatsapp/normalize";
import { getEvolutionMedia } from "@/lib/evolution/client";
import type { Database, Json } from "@/types/database";

type ServiceClient = SupabaseClient<Database>;
type Connection = Database["public"]["Tables"]["whatsapp_connections"]["Row"];
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function unwrapMessage(value: unknown): JsonObject {
  let current = object(value);
  for (const key of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2"]) {
    const wrapper = object(current[key]);
    if (wrapper.message) current = object(wrapper.message);
  }
  return current;
}

function messageContent(raw: unknown) {
  const message = unwrapMessage(raw);
  const extended = object(message.extendedTextMessage);
  const image = object(message.imageMessage);
  const document = object(message.documentMessage);
  const audio = object(message.audioMessage);
  const video = object(message.videoMessage);
  const reaction = object(message.reactionMessage);
  const contact = object(message.contactMessage);
  const location = object(message.locationMessage);

  if (text(message.conversation)) {
    return { type: "text", body: text(message.conversation), mime: null, fileName: null };
  }
  if (text(extended.text)) {
    return { type: "text", body: text(extended.text), mime: null, fileName: null };
  }
  if (Object.keys(image).length) {
    return { type: "image", body: text(image.caption), mime: text(image.mimetype), fileName: null };
  }
  if (Object.keys(document).length) {
    return {
      type: "document",
      body: text(document.caption) ?? text(document.title),
      mime: text(document.mimetype),
      fileName: text(document.fileName),
    };
  }
  if (Object.keys(audio).length) {
    return { type: "audio", body: null, mime: text(audio.mimetype), fileName: null };
  }
  if (Object.keys(video).length) {
    return { type: "video", body: text(video.caption), mime: text(video.mimetype), fileName: null };
  }
  if (Object.keys(reaction).length) {
    return { type: "reaction", body: text(reaction.text), mime: null, fileName: null };
  }
  if (Object.keys(contact).length) {
    return { type: "contact", body: text(contact.displayName), mime: null, fileName: null };
  }
  if (Object.keys(location).length) {
    return { type: "location", body: text(location.name), mime: null, fileName: null };
  }
  return { type: "unknown", body: null, mime: null, fileName: null };
}

function occurredAt(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function preview(type: string, body: string | null) {
  if (body) return body.slice(0, 180);
  return ({ image: "Imagem", document: "Documento", audio: "Áudio", video: "Vídeo", contact: "Contato", location: "Localização", reaction: "Reação" } as Record<string, string>)[type] ?? "Mensagem";
}

const MEDIA_BUCKET = "whatsapp-media";

function mediaExtension(mimeType: string) {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("avif")) return "avif";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("opus")) return "opus";
  return "ogg";
}

async function ensureMediaBucket(client: ServiceClient) {
  const { error: readError } = await client.storage.getBucket(MEDIA_BUCKET);
  if (!readError) return;
  const { error: createError } = await client.storage.createBucket(MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["audio/*", "image/*"],
  });
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    throw createError;
  }
}

async function attachMedia(
  client: ServiceClient,
  connection: Connection,
  messageId: string,
  externalId: string,
  rawMessage: JsonObject,
  fallbackMimeType: string | null,
) {
  try {
    const media = await getEvolutionMedia(
      connection.instance_name,
      rawMessage,
      fallbackMimeType,
    );
    if (!media.ok) throw new Error(media.error);

    await ensureMediaBucket(client);
    const digest = createHash("sha256").update(externalId).digest("hex");
    const path = `${connection.company_id}/${connection.id}/${digest}.${mediaExtension(media.mimeType)}`;
    const { error: uploadError } = await client.storage
      .from(MEDIA_BUCKET)
      .upload(path, media.bytes, {
        contentType: media.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
      throw uploadError;
    }

    await client
      .from("whatsapp_messages")
      .update({
        media_path: path,
        media_mime_type: media.mimeType,
        error_message: null,
      })
      .eq("company_id", connection.company_id)
      .eq("id", messageId);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Falha ao buscar a mídia.";
    const label = fallbackMimeType?.startsWith("image/") ? "Imagem" : "Áudio";
    await client
      .from("whatsapp_messages")
      .update({
        error_message: `${label} recebida, mas o arquivo não pôde ser carregado: ${reason}`.slice(0, 500),
      })
      .eq("company_id", connection.company_id)
      .eq("id", messageId);
  }
}

async function findContact(client: ServiceClient, companyId: string, remoteJid: string) {
  if (!jidCanBeMatchedToPhone(remoteJid)) return null;
  const phone = normalizeWhatsAppPhone(remoteJid);
  const { data } = await client
    .from("supplier_contacts")
    .select("id, supplier_id, name, whatsapp, phone")
    .eq("company_id", companyId)
    .eq("is_active", true);
  return data?.find((contact) =>
    phonesEquivalent(phone, contact.whatsapp ?? contact.phone ?? ""),
  ) ?? null;
}

async function ingestMessage(
  client: ServiceClient,
  connection: Connection,
  raw: unknown,
) {
  const data = object(raw);
  const key = object(data.key);
  const externalId = text(key.id) ?? text(data.messageId);
  const primaryJid = text(key.remoteJid) ?? text(data.remoteJid);
  const alternativeJid = text(key.remoteJidAlt) ?? text(data.remoteJidAlt);
  // No modo multi-device a Evolution pode entregar um identificador @lid no
  // campo principal e o telefone real em remoteJidAlt. Usar o alternativo
  // evita abrir outra conversa e permite reconhecer o fornecedor cadastrado.
  const remoteJid = primaryJid?.endsWith("@lid") && alternativeJid
    ? alternativeJid
    : primaryJid;
  if (!externalId || !remoteJid || remoteJid.endsWith("@g.us")) return "ignored";

  const fromMe = key.fromMe === true;
  const direction = fromMe ? "outbound" : "inbound";
  const content = messageContent(data.message);
  const timestamp = occurredAt(data.messageTimestamp ?? data.timestamp);
  const pushName = text(data.pushName);
  const contact = await findContact(client, connection.company_id, remoteJid);

  const { data: existingMessage } = await client
    .from("whatsapp_messages")
    .select("id, media_path, message_type")
    .eq("connection_id", connection.id)
    .eq("external_message_id", externalId)
    .maybeSingle();
  if (existingMessage) {
    if (["audio", "image"].includes(content.type) && !existingMessage.media_path) {
      await attachMedia(
        client,
        connection,
        existingMessage.id,
        externalId,
        data,
        content.mime,
      );
    }
    return "duplicate";
  }

  const { data: existingConversation, error: conversationReadError } = await client
    .from("whatsapp_conversations")
    .select("id, unread_count, supplier_id, supplier_contact_id, inbox_category")
    .eq("connection_id", connection.id)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (conversationReadError) throw conversationReadError;

  const conversationPatch = {
    supplier_id: existingConversation?.supplier_id ?? contact?.supplier_id ?? null,
    supplier_contact_id: existingConversation?.supplier_contact_id ?? contact?.id ?? null,
    display_name:
      contact?.name ?? pushName ?? (normalizeWhatsAppPhone(remoteJid) || remoteJid),
    normalized_phone: jidCanBeMatchedToPhone(remoteJid) ? normalizeWhatsAppPhone(remoteJid) : null,
    last_message_at: timestamp,
    last_message_preview: preview(content.type, content.body),
    last_direction: direction,
    awaiting_side: fromMe ? "supplier" : "buyer",
    unread_count:
      fromMe || existingConversation?.inbox_category === "promotion"
        ? (existingConversation?.unread_count ?? 0)
        : (existingConversation?.unread_count ?? 0) + 1,
  };

  let conversationId = existingConversation?.id;
  if (conversationId) {
    const { error } = await client
      .from("whatsapp_conversations")
      .update(conversationPatch)
      .eq("id", conversationId)
      .eq("company_id", connection.company_id);
    if (error) throw error;
  } else {
    const { data: created, error } = await client
      .from("whatsapp_conversations")
      .insert({
        ...conversationPatch,
        company_id: connection.company_id,
        connection_id: connection.id,
        remote_jid: remoteJid,
      })
      .select("id")
      .single();
    if (error) throw error;
    conversationId = created.id;
  }

  const { data: createdMessage, error: messageError } = await client.from("whatsapp_messages").insert({
    company_id: connection.company_id,
    connection_id: connection.id,
    conversation_id: conversationId,
    external_message_id: externalId,
    direction,
    message_type: content.type,
    body: content.body,
    media_mime_type: content.mime,
    media_file_name: content.fileName,
    status: fromMe ? "sent" : "delivered",
    occurred_at: timestamp,
    sent_at: fromMe ? timestamp : null,
    delivered_at: fromMe ? null : timestamp,
    raw_payload: data as Json,
  }).select("id").single();
  if (messageError && messageError.code !== "23505") throw messageError;

  if (createdMessage && ["audio", "image"].includes(content.type)) {
    await attachMedia(
      client,
      connection,
      createdMessage.id,
      externalId,
      data,
      content.mime,
    );
  }

  if (!fromMe && contact) {
    await client.from("communication_logs").insert({
      company_id: connection.company_id,
      supplier_id: contact.supplier_id,
      supplier_contact_id: contact.id,
      channel: "whatsapp",
      provider: "evolution",
      direction: "inbound",
      status: "delivered",
      external_message_id: externalId,
      delivered_at: timestamp,
    });
  }
  return "processed";
}

function statusFromEvolution(value: unknown) {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("ERROR")) return "failed";
  if (raw.includes("PENDING")) return "pending";
  if (raw.includes("PLAYED")) return "played";
  if (raw.includes("READ")) return "read";
  if (raw.includes("DELIVERY")) return "delivered";
  if (raw.includes("SERVER") || raw.includes("SENT")) return "sent";
  if (raw.includes("DELETE")) return "deleted";
  return null;
}

async function updateMessage(client: ServiceClient, connection: Connection, raw: unknown, deleted = false) {
  const data = object(raw);
  const key = object(data.key);
  const id = text(key.id) ?? text(data.messageId) ?? text(data.id);
  const update = object(data.update);
  const status = deleted
    ? "deleted"
    : statusFromEvolution(data.status ?? update.status);
  if (!id || !status) return "ignored";
  const now = new Date().toISOString();
  const patch = {
    status,
    ...(status === "delivered" ? { delivered_at: now } : {}),
    ...(status === "read" || status === "played" ? { read_at: now, delivered_at: now } : {}),
  };
  const { error } = await client
    .from("whatsapp_messages")
    .update(patch)
    .eq("connection_id", connection.id)
    .eq("external_message_id", id);
  if (error) throw error;
  if (["delivered", "read", "played"].includes(status)) {
    await client
      .from("communication_logs")
      .update({ status: "delivered", delivered_at: now })
      .eq("company_id", connection.company_id)
      .eq("external_message_id", id);
  }
  return "processed";
}

export async function processEvolutionEvent(
  client: ServiceClient,
  connection: Connection,
  eventType: string,
  payload: JsonObject,
) {
  const normalized = eventType.replace(/[.\s-]+/g, "_").toUpperCase();
  const rawData = payload.data;
  const items = Array.isArray(rawData) ? rawData : [rawData];

  if (["MESSAGES_UPSERT", "SEND_MESSAGE"].includes(normalized)) {
    let processed = false;
    for (const item of items) {
      const result = await ingestMessage(client, connection, item);
      processed ||= result === "processed" || result === "duplicate";
    }
    return processed ? "processed" : "ignored";
  }
  if (["MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE"].includes(normalized)) {
    for (const item of items) await updateMessage(client, connection, item);
    return "processed";
  }
  if (normalized === "MESSAGES_DELETE") {
    for (const item of items) await updateMessage(client, connection, item, true);
    return "processed";
  }
  if (normalized === "CONNECTION_UPDATE") {
    const data = object(rawData);
    const rawState = String(data.state ?? data.status ?? "unknown").toLowerCase();
    const status = rawState === "open" || rawState === "connected"
      ? "connected"
      : rawState === "connecting"
        ? "connecting"
        : rawState === "close" || rawState === "disconnected"
          ? "disconnected"
          : "error";
    const now = new Date().toISOString();
    const { error } = await client
      .from("whatsapp_connections")
      .update({
        status,
        last_event_at: now,
        last_connected_at: status === "connected" ? now : connection.last_connected_at,
        last_error: status === "error" ? text(data.reason) ?? "Conexão indisponível." : null,
      })
      .eq("id", connection.id);
    if (error) throw error;
    return "processed";
  }
  return "ignored";
}
