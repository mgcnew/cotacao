import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv, publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client privilegiado — IGNORA RLS.
 *
 * Uso restrito às operações que o banco deliberadamente não expõe a
 * `authenticated`, hoje apenas duas:
 *
 *  1. `private.provision_company` (criação de tenant);
 *  2. `rpc_service_store_public_token` (guarda o SHA-256 do token do
 *     fornecedor — o token bruto nunca é persistido);
 *  3. `rpc_service_rotate_receiving_display_link` (troca o token do painel
 *     público de recebimento, também persistindo somente o hash).
 *
 * Regras de uso:
 *  - só dentro de `src/app/api/**` ou server actions;
 *  - sempre validando antes quem é o usuário e se ele tem permissão na
 *    empresa alvo, porque aqui não há RLS para segurar nada;
 *  - jamais para contornar uma RPC de domínio.
 */
export function createServiceRoleClient() {
  const { SUPABASE_SECRET_KEY } = getServerEnv();

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
