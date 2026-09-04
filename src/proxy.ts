import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (era `middleware` até o Next 15).
 *
 * Faz duas coisas, e só isso:
 *  1. renova o token do Supabase e repassa os cookies atualizados;
 *  2. redireciona de forma OTIMISTA quem não tem sessão.
 *
 * A autorização de verdade — empresa e permissão — não mora aqui. Ela fica
 * no DAL (`src/lib/auth/dal.ts`) e, em última instância, nas policies e RPCs
 * do banco. O guia do Next é explícito: proxy roda em toda rota, inclusive
 * em prefetch, então não deve consultar banco.
 *
 * E era exatamente isso que ele fazia. `getUser()` pergunta ao servidor de auth
 * do Supabase, e medindo em produção deu 297 ms de MÉDIA, em toda requisição --
 * inclusive nos prefetch, que o Next dispara para cada link visível. Numa tela
 * com dez links, dez idas à rede antes de a pessoa clicar em nada.
 *
 * `getClaims()` confere a assinatura do token no próprio processo, com a chave
 * pública do projeto (ES256) e o JWKS em cache. Continua renovando o token
 * quando expirado — é `getSession()` por dentro —, então os cookies renovados
 * seguem sendo capturados pelo `setAll` abaixo, que é a razão de ser deste
 * arquivo.
 */

/** Rotas que não exigem sessão. Os portais do fornecedor entram aqui: ele
 *  acessa por token, sem login. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/opengraph-image",
  "/q/",
  "/o/",
  "/r/",
  "/api/evolution/",
];

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix),
    )
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Verificação local da assinatura; renova o token se estiver expirado, e é
  // essa renovação que o setAll acima captura.
  const { data } = await supabase.auth.getClaims();
  const temSessao = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;

  if (!temSessao && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserva o destino para voltar depois do login.
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  if (temSessao && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Devolver ESTE response (e não um novo) preserva os cookies renovados.
  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos assets estáticos e imagens — que não têm sessão a renovar.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
