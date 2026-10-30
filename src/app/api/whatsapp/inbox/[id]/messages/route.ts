import { readJson, withInbox } from "@/features/whatsapp/inbox-http";
import { loadEarlier, sendMessage } from "@/features/whatsapp/inbox-service";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ id: string }> };

/** Mensagens anteriores a `before`, para "Mostrar mensagens anteriores". */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const before = new URL(request.url).searchParams.get("before") ?? "";
  return withInbox(request, (context) =>
    loadEarlier(context, { conversationId: id, before }),
  );
}

/** Envia uma mensagem de texto pelo número da empresa. */
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return withInbox(request, async (context) =>
    sendMessage(context, id, await readJson(request)),
  );
}
