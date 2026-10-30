import { withInbox } from "@/features/whatsapp/inbox-http";
import { refreshInbox } from "@/features/whatsapp/inbox-service";

export const runtime = "nodejs";

/** Todas as conversas recentes — a recarga que cobre o que passou com a tela dormindo. */
export async function GET(request: Request) {
  return withInbox(request, (context) => refreshInbox(context));
}
