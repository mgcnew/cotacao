"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { publicEnv } from "@/lib/env";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Envio da cotação ao fornecedor.
 *
 * O fluxo é o do RPC_FLOW: o backend gera o token bruto, guarda APENAS o
 * SHA-256, monta a URL, e só marca como enviado depois que a comunicação
 * realmente saiu. Enquanto a Evolution não está configurada, "comunicação"
 * é o comprador copiar o link e mandar — o documento prevê esse caminho
 * manual, e ele mantém o registro honesto.
 */

export type SendState = {
  error: string | null;
  /** Link recém-gerado, mostrado uma única vez. */
  url?: string;
  savedAt?: number;
};

/** Token bruto: 32 bytes de aleatoriedade criptográfica, em base64url. */
function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Gera o link público de um fornecedor da rodada.
 *
 * `rpc_service_store_public_token` roda como service_role e NÃO faz checagem
 * de permissão por dentro — ela confia em quem chama. Então a autorização é
 * feita aqui, e é obrigatória:
 *  1. o usuário precisa de `purchase_round.send` na empresa ativa;
 *  2. o round_supplier precisa ser da empresa ativa — confirmado por leitura
 *     com o client normal, ou seja, passando pela RLS.
 *
 * O token bruto só existe nesta função e na resposta. O banco guarda o hash.
 */
export async function generateQuotationLink(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("purchase_round.send")) {
    return { error: "Seu papel não permite enviar cotações." };
  }

  const roundSupplierId = String(formData.get("roundSupplierId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");

  // Leitura com o client do usuário: se a RLS não devolver a linha, o
  // fornecedor não é desta empresa e a geração para aqui.
  const supabase = await createServerSupabaseClient();
  const { data: roundSupplier, error: readError } = await supabase
    .from("round_suppliers")
    .select("id, supplier_id, purchase_round_id")
    .eq("company_id", company.companyId)
    .eq("id", roundSupplierId)
    .maybeSingle();

  if (readError) {
    return { error: `Falha ao carregar o fornecedor: ${readError.message}` };
  }
  if (!roundSupplier) {
    return { error: "Fornecedor não encontrado nesta rodada." };
  }

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (cause) {
    console.error("[generateQuotationLink] service role indisponível:", cause);
    return {
      error:
        "O servidor está sem a chave de administração do Supabase. Configure o .env.local.",
    };
  }

  const rawToken = newRawToken();

  // 30 dias: prazo folgado para o fornecedor responder, curto o bastante para
  // um link vazado não valer para sempre.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { error } = await service.rpc("rpc_service_store_public_token", {
    p_company_id: company.companyId,
    p_purpose: "quotation_response",
    p_supplier_id: roundSupplier.supplier_id,
    p_round_supplier_id: roundSupplier.id,
    p_token_hash: sha256Hex(rawToken),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return { error: `Não foi possível gerar o link: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId}`);

  return {
    error: null,
    savedAt: Date.now(),
    url: `${publicEnv.NEXT_PUBLIC_APP_URL}/q/${rawToken}`,
  };
}

/**
 * Marca o fornecedor como enviado.
 *
 * Aqui usamos a RPC, que é onde o schema centralizou o efeito: além de gravar
 * `first_sent_at`, ela ativa a rodada, abre os grupos e emite o evento de
 * domínio `quotation.sent`. Fazer UPDATE direto pularia tudo isso.
 *
 * Devolve estado em vez de lançar: falha de envio é recado para quem enviou,
 * não motivo para perder a tela.
 */
export async function markSupplierSent(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const company = await requireActiveCompany();

  const roundSupplierId = String(formData.get("roundSupplierId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundSupplierId) return { error: "Fornecedor inválido." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_mark_round_supplier_sent", {
    p_company_id: company.companyId,
    p_round_supplier_id: roundSupplierId,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite enviar cotações." };
    }
    return { error: `Não foi possível marcar como enviado: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}
