import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client de servidor com a sessão do usuário (Server Components, Server
 * Actions e Route Handlers autenticados). Continua sujeito a RLS.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
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
