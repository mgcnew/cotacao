import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client de servidor com a sessão do usuário (Server Components, Server
 * Actions e Route Handlers autenticados). Continua sujeito a RLS.
 */
/**
 * Cronômetro de cada ida ao Supabase, ligado por `MEDIR_SUPABASE=1`.
 *
 * Fica desligado em produção e não custa nada: sem a variável, o client nem
 * recebe um `fetch` próprio. Ligado, imprime `[sb] 234ms /rest/v1/...` por
 * requisição — foi assim que se descobriu que o dashboard fazia dezoito
 * viagens e que cada uma custa ~230 ms de rede, e não de banco.
 *
 * Está aqui, e não num galho apagado, porque toda pergunta sobre velocidade
 * volta: `npm run start:medir` responde em um minuto, sem reinstrumentar nada.
 */
const medindo = process.env.MEDIR_SUPABASE === "1";

const fetchMedido: typeof fetch = async (input, init) => {
  const t0 = performance.now();
  const url =
    typeof input === "string" ? input : String((input as Request).url ?? input);
  try {
    return await fetch(input, init);
  } finally {
    const ms = Math.round(performance.now() - t0);
    // Sem o host, e cortado: o que interessa é qual recurso, não a query toda.
    const caminho = url.replace(/^https?:\/\/[^/]+/, "").slice(0, 110);
    console.log(`[sb] ${String(ms).padStart(4)}ms ${caminho}`);
  }
};

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      ...(medindo ? { global: { fetch: fetchMedido } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components não podem escrever cookies. A renovação da
            // sessão acontece no proxy.ts, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}

/**
 * Usuário autenticado validado no servidor de auth do Supabase.
 * Use isto — e não getSession() — para decidir autorização no servidor.
 */
export async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
