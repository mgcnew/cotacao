import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveCompany, getUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  enviarPeloWhatsApp,
  gerarLinkComMensagem,
  marcarEnviado,
} from "@/features/rounds/send-service";

export const runtime = "nodejs";

const corpo = z.object({
  acao: z.enum(["convite", "cobranca", "link", "marcar"]),
  roundSupplierId: z.uuid(),
});

/**
 * Envio em lote da aba Respostas, um fornecedor por chamada.
 *
 * Rota e não Server Action: a tela chama em sequência, com uma pausa entre
 * uma mensagem e outra, e as actions rodam em fila com a navegação — o lote
 * prenderia a página enquanto durasse. Um por chamada também deixa a tela
 * mostrar o andamento de cada fornecedor e repetir só o que falhou.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/compras/[id]/envio">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const company = await getActiveCompany();
  if (!company)
    return Response.json({ error: "Acesso não permitido." }, { status: 403 });
  if (!company.permissions.includes("purchase_round.send")) {
    return Response.json(
      { error: "Seu papel não permite enviar cotações." },
      { status: 403 },
    );
  }

  const { id: roundId } = await ctx.params;
  const parsed = corpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(roundId).success) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const { acao, roundSupplierId } = parsed.data;
  const contexto = {
    companyId: company.companyId,
    companyName: company.companyName,
    supabase: await createServerSupabaseClient(),
  };

  if (acao === "link") {
    const result = await gerarLinkComMensagem(contexto, {
      roundSupplierId,
      roundId,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  if (acao === "marcar") {
    const error = await marcarEnviado(contexto, roundSupplierId);
    revalidatePath(`/compras/${roundId}`);
    return Response.json(
      error
        ? {
            ok: false,
            error: `Não foi possível marcar como enviado: ${error.message}`,
          }
        : { ok: true },
    );
  }

  const result = await enviarPeloWhatsApp(contexto, {
    roundSupplierId,
    roundId,
    tipo: acao,
  });
  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
