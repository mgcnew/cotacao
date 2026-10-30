import { readJson, withInbox } from "@/features/whatsapp/inbox-http";
import { loadConversation, patchConversation } from "@/features/whatsapp/inbox-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Histórico recente da conversa e a compra a que ela está ligada. */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  return withInbox(request, (context) =>
    loadConversation(context, {
      conversationId: id,
      roundId: query.get("round") || null,
      orderId: query.get("order") || null,
    }),
  );
}

/** Quem responde agora, categoria da caixa ou ligação a um fornecedor. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return withInbox(request, async (context) =>
    patchConversation(context, id, await readJson(request)),
  );
}
