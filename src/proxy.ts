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
 */

/** Rotas que não exigem sessão. Os portais do fornecedor entram aqui: ele
 *  acessa por token, sem login. */
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/q/", "/o/"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
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

  // Precisa ser getUser(): valida o token no servidor de auth e, de quebra,
  // dispara a renovação cujos cookies o setAll acima captura.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserva o destino para voltar depois do login.
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
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
