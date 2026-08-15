"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { publicEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type OrderActionState = {
  error: string | null;
  url?: string;
  savedAt?: number;
};

/**
 * Envio do pedido ao fornecedor.
 *
 * Mesmo desenho da cotação: token bruto gerado aqui, só o SHA-256 no banco, e
 * o "marquei como enviado" separado da geração do link — porque quem envia,
 * enquanto a Evolution não está ligada, é a pessoa.
 *
 * `rpc_service_store_public_token` roda como service_role e não checa
 * permissão por dentro. A autorização é feita aqui: `order.send` e leitura da
 * revisão com o client do usuário, ou seja, passando pela RLS.
 */
export async function generateOrderLink(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.send")) {
    return { error: "Seu papel não permite enviar pedidos." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");

  const supabase = await createServerSupabaseClient();
  const { data: revision, error: readError } = await supabase
    .from("order_revisions")
    .select("id, order_id, orders!inner ( supplier_id )")
    .eq("company_id", company.companyId)
    .eq("id", revisionId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (readError) {
    return { error: `Falha ao carregar a revisão: ${readError.message}` };
  }
  if (!revision) {
    return { error: "Revisão não encontrada neste pedido." };
  }

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (cause) {
    console.error("[generateOrderLink] service role indisponível:", cause);
    return {
      error:
        "O servidor está sem a chave de administração do Supabase. Configure o .env.local.",
    };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { error } = await service.rpc("rpc_service_store_public_token", {
    p_company_id: company.companyId,
    p_purpose: "order_confirmation",
    p_supplier_id: revision.orders.supplier_id,
    p_order_revision_id: revision.id,
    p_token_hash: createHash("sha256").update(rawToken).digest("hex"),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return { error: `Não foi possível gerar o link: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  return {
    error: null,
    savedAt: Date.now(),
    url: `${publicEnv.NEXT_PUBLIC_APP_URL}/o/${rawToken}`,
  };
}

/**
 * Marca a revisão como enviada.
 *
 * A RPC move o pedido para `awaiting_confirmation`, marca a revisão como
 * `sent` e emite `order.sent`. Só depois disso o fornecedor consegue
 * confirmar, e só depois da confirmação dele o recebimento é liberado.
 */
export async function markOrderSent(orderId: string, revisionId: string) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("rpc_mark_order_revision_sent", {
    p_company_id: company.companyId,
    p_order_revision_id: revisionId,
  });

  if (error) {
    throw new Error(`Não foi possível marcar como enviado: ${error.message}`);
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
}

/**
 * Dá entrada na mercadoria.
 *
 * Três números por item, e eles não são redundantes:
 *  - quantidade logística: o que entrou fisicamente (caixas, peças);
 *  - quantidade de precificação: a base do dinheiro (quilos, litros);
 *  - preço praticado: o que veio na nota.
 *
 * A RPC compara o preço praticado com o combinado e abre divergência
 * comercial sozinha quando diferem — por isso não perguntamos "houve
 * divergência?": o sistema descobre.
 */
export async function postReceipt(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const receivedAt = String(formData.get("receivedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const itemIds = formData.getAll("itemId").map(String);
  if (itemIds.length === 0) {
    return { error: "Este pedido não tem itens para receber." };
  }

  const items: {
    order_revision_item_id: string;
    logistic_quantity_received: string;
    pricing_quantity_received: string;
    practiced_price: string;
    notes?: string;
  }[] = [];

  for (const id of itemIds) {
    const toNumber = (raw: string) =>
      raw.trim().replace(/\./g, "").replace(",", ".");

    const logistic = toNumber(String(formData.get(`log_${id}`) ?? ""));
    const pricing = toNumber(String(formData.get(`prec_${id}`) ?? ""));
    const price = toNumber(String(formData.get(`preco_${id}`) ?? ""));
    const nome = String(formData.get(`nome_${id}`) ?? "este item");

    // Item não recebido nesta remessa: some do payload em vez de ir zerado.
    if (!logistic && !pricing && !price) continue;

    if (!logistic || !pricing || !price) {
      return {
        error: `Em "${nome}", preencha quantidade recebida, quantidade de precificação e preço praticado.`,
      };
    }
    if (
      ![logistic, pricing, price].every(
        (v) => Number.isFinite(Number(v)) && Number(v) >= 0,
      )
    ) {
      return { error: `Há valor inválido em "${nome}".` };
    }

    items.push({
      order_revision_item_id: id,
      logistic_quantity_received: logistic,
      pricing_quantity_received: pricing,
      practiced_price: price,
      notes: String(formData.get(`obs_${id}`) ?? "").trim() || undefined,
    });
  }

  if (items.length === 0) {
    return { error: "Informe ao menos um item recebido." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_post_receipt", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
    p_items: items,
    p_notes: notes || undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite dar entrada em mercadoria." };
    }
    if (error.message.includes("não foi confirmada")) {
      return {
        error:
          "O fornecedor ainda não confirmou este pedido. Sem a confirmação, o recebimento fica bloqueado.",
      };
    }
    if (error.message.includes("não está aguardando")) {
      return { error: "Este pedido não está aguardando entrega." };
    }
    return { error: `Não foi possível registrar: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}
