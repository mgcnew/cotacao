import "server-only";

import { inboxContext, type InboxContext } from "@/features/whatsapp/inbox-service";

/**
 * Casca comum das rotas da caixa: sessão, defesa de origem e erro sem vazar
 * detalhe. A regra de negócio mora em `inbox-service.ts`.
 */
export async function withInbox(
  request: Request,
  handler: (context: InboxContext) => Promise<unknown>,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (request.method !== "GET") {
      // Cookie de sessão sozinho não prova que o pedido veio da nossa tela:
      // exige JSON (que o navegador não deixa um formulário de outro site
      // enviar sem pré-verificação) e, quando há Origin, que seja o nosso.
      const origin = request.headers.get("origin");
      const sameOrigin = !origin || new URL(origin).host === request.headers.get("host");
      const json = request.headers.get("content-type")?.startsWith("application/json");
      if (!sameOrigin || !json) {
        return Response.json({ ok: false, error: "Pedido não autorizado." }, { status: 403, headers });
      }
    }
    const context = await inboxContext();
    if (!context) {
      return Response.json(
        { ok: false, error: "Sua sessão expirou. Entre de novo." },
        { status: 401, headers },
      );
    }
    return Response.json(await handler(context), { headers });
  } catch (cause) {
    console.error("[whatsapp/inbox]", cause);
    return Response.json(
      { ok: false, error: "Não foi possível concluir agora. Tente de novo." },
      { status: 500, headers },
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
