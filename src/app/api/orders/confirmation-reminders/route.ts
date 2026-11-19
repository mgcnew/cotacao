import { processOrderConfirmationReminders } from "@/features/orders/reminders";
import { getServerEnv } from "@/lib/env";
import { isEvolutionConfigured } from "@/lib/evolution/client";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isEvolutionConfigured()) {
    return Response.json({ error: "Envio de WhatsApp não configurado." }, { status: 503 });
  }
  try {
    const result = await processOrderConfirmationReminders(createServiceRoleClient());
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed > 0 ? 500 : 200 });
  } catch (cause) {
    console.error("[order-reminders] Falha no processamento", cause);
    return Response.json({ error: "Falha ao processar os lembretes." }, { status: 500 });
  }
}
