"use server";

import { revalidatePath } from "next/cache";

import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { enviarPeloWhatsApp, issueQuotationLink } from "./send-service";

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
  sent?: boolean;
};

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
    .select("id, supplier_id, purchase_round_id, removed_at")
    .eq("company_id", company.companyId)
    .eq("id", roundSupplierId)
    .maybeSingle();

  if (readError) {
    return { error: `Falha ao carregar o fornecedor: ${readError.message}` };
  }
  if (!roundSupplier) {
    return { error: "Fornecedor não encontrado nesta rodada." };
  }
  if (roundSupplier.removed_at) {
    return { error: "Este fornecedor foi retirado da rodada." };
  }

  const { count: activeItems, error: itemsError } = await supabase
    .from("supplier_quotation_items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId)
    .eq("round_supplier_id", roundSupplier.id)
    .is("removed_at", null);

  if (itemsError) {
    return { error: `Falha ao conferir os produtos: ${itemsError.message}` };
  }
  if (!activeItems) {
    return {
      error: "Escolha ao menos um grupo com produtos antes de gerar o link.",
    };
  }

  const link = await issueQuotationLink({
    companyId: company.companyId,
    supplierId: roundSupplier.supplier_id,
    roundSupplierId: roundSupplier.id,
  });
  if (!link.ok) return { error: link.error };

  revalidatePath(`/compras/${roundId}`);

  return {
    error: null,
    savedAt: Date.now(),
    url: link.url,
  };
}

/** Gera o link, envia ao contato escolhido e registra o ciclo da comunicação. */
export async function sendQuotationWhatsApp(
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
  if (!roundSupplierId) return { error: "Fornecedor inválido." };

  const result = await enviarPeloWhatsApp(
    {
      companyId: company.companyId,
      companyName: company.companyName,
      supabase: await createServerSupabaseClient(),
    },
    { roundSupplierId, tipo: "convite" },
  );
  if (roundId) revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  revalidatePath("/whatsapp");
  if (!result.ok) return { error: result.error, url: result.url };
  return { error: result.aviso ?? null, sent: true, savedAt: Date.now() };
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
