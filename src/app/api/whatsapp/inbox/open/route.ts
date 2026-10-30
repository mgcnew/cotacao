import { z } from "zod";

import { readJson, withInbox } from "@/features/whatsapp/inbox-http";
import { openConversation } from "@/features/whatsapp/inbox-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withInbox(request, async (context) => {
    const body = z.object({ contactId: z.string() }).safeParse(await readJson(request));
    if (!body.success) return { ok: false, error: "Escolha um contato válido." };
    return openConversation(context, body.data.contactId);
  });
}
