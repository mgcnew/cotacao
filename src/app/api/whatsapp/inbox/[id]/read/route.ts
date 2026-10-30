import { withInbox } from "@/features/whatsapp/inbox-http";
import { markRead } from "@/features/whatsapp/inbox-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return withInbox(request, (context) => markRead(context, id));
}
