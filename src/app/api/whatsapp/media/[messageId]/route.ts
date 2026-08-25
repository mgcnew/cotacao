import { z } from "zod";

import { requireActiveCompany } from "@/lib/auth/dal";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const company = await requireActiveCompany();
  const parsed = z.string().uuid().safeParse((await params).messageId);
  if (!parsed.success) return new Response("Mensagem inválida.", { status: 400 });

  // A consulta autenticada e sujeita a RLS comprova que a mensagem pertence
  // à empresa ativa antes de o cliente privilegiado tocar no bucket privado.
  const supabase = await createServerSupabaseClient();
  const { data: message, error } = await supabase
    .from("whatsapp_messages")
    .select("media_path, media_mime_type, message_type")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data)
    .maybeSingle();
  if (error || !message || !["audio", "image"].includes(message.message_type) || !message.media_path) {
    return new Response("Mídia não encontrada.", { status: 404 });
  }

  const service = createServiceRoleClient();
  const { data: file, error: downloadError } = await service.storage
    .from("whatsapp-media")
    .download(message.media_path);
  if (downloadError || !file) return new Response("Áudio indisponível.", { status: 404 });

  const mimeType = message.media_mime_type?.startsWith("audio/")
    || message.media_mime_type?.startsWith("image/")
      ? message.media_mime_type
      : message.message_type === "image"
        ? "image/jpeg"
        : "audio/ogg";
  const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const requestedEnd = range?.[2] ? Number(range[2]) : file.size - 1;
  const end = Math.min(requestedEnd, file.size - 1);
  if (range && (!Number.isSafeInteger(start) || start < 0 || start > end)) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.size}` },
    });
  }
  const body = range ? file.slice(start, end + 1, mimeType) : file;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.size),
      "Cache-Control": "private, max-age=300",
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
