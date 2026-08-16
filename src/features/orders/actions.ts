"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildOrderMessage, normalizePhone } from "@/features/orders/message";
import { getOrderMessageContext } from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { publicEnv } from "@/lib/env";
import {
  isEvolutionConfigured,
  sendWhatsAppText,
} from "@/lib/evolution/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type OrderActionState = {
  error: string | null;
  url?: string;
  /** Mensagem pronta do pedido, já com o link, para copiar ou mandar. */
  message?: string;
  savedAt?: number;
};

/**
 * Número digitado por gente: "1.234,50" chega como texto e vai para o banco
 * como "1234.50". Devolve string vazia quando o campo veio em branco, para que
 * quem chama distinga "não preenchido" de zero.
 */
function toDecimal(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
}

type ItemRow = {
  itemId: string;
  productId: string;
  allocationId: string;
  quantity: string;
  price: string;
  notes: string;
};

/**
 * Um item no formato que as RPCs de pedido esperam.
 *
 * Números viajam como texto porque o Postgres os converte para `numeric` sem
 * passar por ponto flutuante — 12,10 chega como 12.10, e não como 12.099999.
 */
type OrderItemPayload = {
  id?: string;
  purchase_allocation_id?: string;
  product_id: string;
  requested_quantity: string;
  purchase_unit_id: string;
  pricing_unit_id: string;
  comparison_unit_id: string | null;
  agreed_price: string;
  notes: string | null;
};

/**
 * As linhas do formulário de itens, na ordem em que aparecem na tela.
 *
 * Chegam como arrays paralelos — o FormData preserva a ordem dos campos de
 * mesmo nome —, então o índice é o que casa produto, quantidade e preço da
 * mesma linha.
 */
function readItemRows(formData: FormData): ItemRow[] {
  const itemIds = formData.getAll("itemId").map(String);
  const productIds = formData.getAll("productId").map(String);
  const allocationIds = formData.getAll("allocationId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const prices = formData.getAll("price").map(String);
  const notes = formData.getAll("itemNotes").map(String);

  return productIds
    .map((productId, index) => ({
      itemId: (itemIds[index] ?? "").trim(),
      productId: productId.trim(),
      allocationId: (allocationIds[index] ?? "").trim(),
      quantity: toDecimal(quantities[index]),
      price: toDecimal(prices[index]),
      notes: (notes[index] ?? "").trim(),
    }))
    // Linha em branco é linha que a pessoa abriu e não usou.
    .filter((row) => row.productId || row.quantity || row.price);
}

/**
 * Traduz as linhas da tela no payload das RPCs de pedido.
 *
 * As unidades NUNCA vêm do formulário: são lidas aqui, do cadastro do produto,
 * com o client do usuário — ou seja, passando pela RLS. Se viessem do cliente,
 * um id de unidade de outra empresa chegaria à RPC, e quem recusaria seria a
 * FK composta, com mensagem de banco em vez de mensagem de gente.
 *
 * Devolve `{ error }` em vez de lançar porque todo erro daqui é erro de
 * preenchimento, e precisa voltar para a tela nomeando o item.
 */
async function buildOrderItems(
  companyId: string,
  rows: ItemRow[],
  options: { keepItemId: boolean },
): Promise<
  { ok: true; items: OrderItemPayload[] } | { ok: false; error: string }
> {
  if (rows.length === 0) {
    return { ok: false, error: "Adicione ao menos um item ao pedido." };
  }

  const supabase = await createServerSupabaseClient();
  // Sem filtrar por `is_active`: um produto desativado depois da compra ainda
  // precisa poder ser corrigido no pedido em que já está. O que não se permite
  // é ENTRAR agora, e essa checagem é logo abaixo, linha a linha.
  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id, name, is_active, purchase_unit_id, pricing_unit_id, comparison_unit_id",
    )
    .eq("company_id", companyId)
    .in("id", rows.map((row) => row.productId).filter(Boolean));

  if (error) {
    return { ok: false, error: `Falha ao carregar os produtos: ${error.message}` };
  }

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const items: OrderItemPayload[] = [];

  for (const row of rows) {
    const product = row.productId ? byId.get(row.productId) : undefined;
    if (!product) {
      return { ok: false, error: "Escolha o produto de cada linha do pedido." };
    }
    if (!product.is_active && !row.itemId) {
      return {
        ok: false,
        error: `"${product.name}" está desativado no catálogo e não pode entrar em um pedido novo.`,
      };
    }

    const quantity = Number(row.quantity);
    const price = Number(row.price);

    if (!row.quantity || !Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: `Informe a quantidade de "${product.name}".` };
    }
    if (!row.price || !Number.isFinite(price) || price < 0) {
      return {
        ok: false,
        error: `Informe o preço combinado de "${product.name}".`,
      };
    }

    items.push({
      // Item existente é atualizado no lugar, e é isso que preserva o vínculo
      // com a alocação que o originou. Item novo vem sem id.
      ...(options.keepItemId && row.itemId ? { id: row.itemId } : {}),
      ...(!options.keepItemId && row.allocationId
        ? { purchase_allocation_id: row.allocationId }
        : {}),
      product_id: product.id,
      requested_quantity: row.quantity,
      purchase_unit_id: product.purchase_unit_id,
      pricing_unit_id: product.pricing_unit_id,
      comparison_unit_id: product.comparison_unit_id,
      agreed_price: row.price,
      notes: row.notes || null,
    });
  }

  return { ok: true, items };
}

/**
 * Pedido direto: compra que não passou por rodada de cotação.
 *
 * O documento mestre (seção 9) prevê este caminho — a página de Pedidos
 * acompanha também o que foi comprado sem cotar. `rpc_create_direct_order` já
 * existia no schema desde a 0013, com `origin = 'direct'`, e nasce em rascunho
 * como qualquer outro: gerar não envia.
 */
export async function createDirectOrder(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.create")) {
    return { error: "Seu papel não permite criar pedidos." };
  }

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!supplierId) return { error: "Escolha o fornecedor." };

  const deliveryDueDate =
    String(formData.get("deliveryDueDate") ?? "").trim() || null;

  const built = await buildOrderItems(
    company.companyId,
    readItemRows(formData),
    { keepItemId: false },
  );
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_create_direct_order", {
    p_company_id: company.companyId,
    p_supplier_id: supplierId,
    p_items: built.items,
    p_delivery_due_date: deliveryDueDate ?? undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite criar pedidos." };
    }
    if (error.message.includes("Fornecedor inválido")) {
      return { error: "Este fornecedor não está ativo." };
    }
    return { error: `Não foi possível criar o pedido: ${error.message}` };
  }

  const orderId = (data as { order_id?: string } | null)?.order_id;
  if (!orderId) {
    return { error: "O pedido foi criado, mas o servidor não devolveu o id." };
  }

  revalidatePath("/pedidos");
  redirect(`/pedidos/${orderId}`);
}

/**
 * Corrige o pedido antes de ele sair daqui.
 *
 * Vale só para revisão em rascunho — documento mestre, 16.11: "antes da
 * comunicação externa, edição direta". Depois do envio, o caminho é outro, e
 * chama-se revisão.
 *
 * Item já existente vai com `id` e é atualizado no lugar pela RPC, o que
 * preserva o `purchase_allocation_id`: sem isso, corrigir a quantidade de um
 * pedido nascido de rodada apagaria o vínculo com a decisão de compra que o
 * originou.
 */
export async function updateDraftOrder(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  const deliveryDueDate =
    String(formData.get("deliveryDueDate") ?? "").trim() || null;

  const built = await buildOrderItems(
    company.companyId,
    readItemRows(formData),
    { keepItemId: true },
  );
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_update_draft_order_revision", {
    p_company_id: company.companyId,
    p_order_revision_id: revisionId,
    p_items: built.items,
    p_delivery_due_date: deliveryDueDate ?? undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite editar pedidos em rascunho." };
    }
    if (error.message.includes("rascunho pode ser editada")) {
      return {
        error:
          "Esta revisão já foi enviada. Para mudar o que foi combinado, crie uma nova revisão.",
      };
    }
    return { error: `Não foi possível salvar: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}

/**
 * Nova revisão de um pedido já enviado.
 *
 * O fornecedor apontou indisponibilidade, a negociação fechou outro número: o
 * combinado muda, e o documento mestre (10.2) manda registrar isso como uma
 * revisão nova, não como edição da antiga — a confirmação do fornecedor está
 * amarrada à revisão que ele viu.
 *
 * Nasce em rascunho e não vai a lugar nenhum sozinha: enviar continua sendo um
 * passo separado, com link novo.
 */
export async function createOrderRevision(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const deliveryDueDate =
    String(formData.get("deliveryDueDate") ?? "").trim() || null;

  const built = await buildOrderItems(
    company.companyId,
    readItemRows(formData),
    { keepItemId: false },
  );
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_create_order_revision", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_items: built.items,
    p_delivery_due_date: deliveryDueDate ?? undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite revisar pedidos." };
    }
    if (error.message.includes("Já existe uma revisão em rascunho")) {
      return {
        error:
          "Já há uma revisão em preparação neste pedido. Termine ou envie aquela primeiro.",
      };
    }
    if (error.message.includes("não permite revisão")) {
      return { error: "Pedido recebido ou cancelado não aceita revisão." };
    }
    return { error: `Não foi possível criar a revisão: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}

/**
 * Cancela o pedido.
 *
 * A RPC faz mais do que mudar o status: revoga o link do fornecedor e cancela
 * as revisões vivas. Sem isso ele confirmaria pelo link um pedido que aqui já
 * estava cancelado — a confirmação pública valida a revisão, não o pedido.
 *
 * Com mercadoria já recebida o caminho é outro, e a RPC recusa: encerrar saldo
 * preserva o que entrou; cancelar fingiria que a entrega não aconteceu.
 */
export async function cancelOrder(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 3) {
    return { error: "Explique por que o pedido está sendo cancelado." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_cancel_order", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite cancelar pedidos." };
    }
    if (error.message.includes("recebimento registrado")) {
      return {
        error:
          "Este pedido já recebeu mercadoria. Encerre o saldo em vez de cancelar — assim o que entrou continua valendo.",
      };
    }
    if (error.message.includes("já recebido")) {
      return { error: "Pedido já recebido não pode ser cancelado." };
    }
    return { error: `Não foi possível cancelar: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}

/**
 * Cria o link público de confirmação de uma revisão.
 *
 * Mesmo desenho da cotação: token bruto gerado aqui, só o SHA-256 no banco. O
 * texto puro existe uma única vez, nesta volta — não há como recuperá-lo
 * depois, apenas emitir outro.
 *
 * `rpc_service_store_public_token` roda como service_role e não checa
 * permissão por dentro. A autorização é do chamador: `order.send` e a leitura
 * da revisão com o client do usuário, ou seja, passando pela RLS.
 */
async function issueOrderLink(
  companyId: string,
  orderId: string,
  revisionId: string,
): Promise<
  | { ok: true; url: string; supplierId: string; message: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data: revision, error: readError } = await supabase
    .from("order_revisions")
    .select(
      // Sem nomear a FK, o PostgREST não sabe por qual das duas relações entre
      // `order_revisions` e `orders` embutir: a outra é
      // `orders.current_revision_id`, e o embed ambíguo falha em tempo de
      // execução.
      "id, order_id, orders!order_revisions_company_id_order_id_fkey ( supplier_id )",
    )
    .eq("company_id", companyId)
    .eq("id", revisionId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: `Falha ao carregar a revisão: ${readError.message}` };
  }
  if (!revision) {
    return { ok: false, error: "Revisão não encontrada neste pedido." };
  }

  const context = await getOrderMessageContext(companyId, orderId, revisionId);

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (cause) {
    console.error("[issueOrderLink] service role indisponível:", cause);
    return {
      ok: false,
      error:
        "O servidor está sem a chave de administração do Supabase. Configure o .env.local.",
    };
  }

  const rawToken = randomBytes(32).toString("base64url");
  // 30 dias: prazo folgado para o fornecedor responder, curto o bastante para
  // um link vazado não valer para sempre.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { error } = await service.rpc("rpc_service_store_public_token", {
    p_company_id: companyId,
    p_purpose: "order_confirmation",
    p_supplier_id: revision.orders.supplier_id,
    p_order_revision_id: revision.id,
    p_token_hash: createHash("sha256").update(rawToken).digest("hex"),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return { ok: false, error: `Não foi possível gerar o link: ${error.message}` };
  }

  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/o/${rawToken}`;

  return {
    ok: true,
    url,
    supplierId: revision.orders.supplier_id,
    // A mensagem é montada aqui, e não no cliente, porque só o servidor conhece
    // o link recém-criado.
    message: context ? buildOrderMessage(context, url) : null,
  };
}

/** Gera o link e a mensagem para quem vai enviar o pedido na mão. */
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

  const link = await issueOrderLink(company.companyId, orderId, revisionId);
  if (!link.ok) return { error: link.error };

  revalidatePath(`/pedidos/${orderId}`);
  return {
    error: null,
    savedAt: Date.now(),
    url: link.url,
    message: link.message ?? undefined,
  };
}

/**
 * Registra a tentativa de comunicação com o fornecedor.
 *
 * Melhor esforço de propósito: o documento mestre (seção 9) separa pedido de
 * comunicação, e um log que falha não pode desfazer um envio que aconteceu.
 * O erro vai para o console do servidor, não para a tela de quem enviou.
 */
async function logCommunication(params: {
  companyId: string;
  supplierId: string;
  revisionId: string;
  contactId: string | null;
  channel: string;
  provider: string;
  status: string;
  externalMessageId?: string;
  errorMessage?: string;
}): Promise<string | null> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("rpc_service_log_communication", {
      p_company_id: params.companyId,
      p_supplier_id: params.supplierId,
      p_channel: params.channel,
      p_provider: params.provider,
      p_status: params.status,
      p_supplier_contact_id: params.contactId ?? undefined,
      p_order_revision_id: params.revisionId,
      p_external_message_id: params.externalMessageId,
      p_error_message: params.errorMessage,
    });
    if (error) throw new Error(error.message);
    return data;
  } catch (cause) {
    console.error("[logCommunication] não foi possível registrar:", cause);
    return null;
  }
}

/** Fecha o log quando o provedor responde: id externo, ou o motivo da falha. */
async function updateCommunicationLog(
  companyId: string,
  logId: string,
  patch: {
    status: string;
    externalMessageId?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.rpc("rpc_service_update_communication_log", {
      p_company_id: companyId,
      p_communication_log_id: logId,
      p_status: patch.status,
      p_external_message_id: patch.externalMessageId ?? undefined,
      p_error_message: patch.errorMessage ?? undefined,
    });
    if (error) throw new Error(error.message);
  } catch (cause) {
    console.error("[updateCommunicationLog] não foi possível atualizar:", cause);
  }
}

/**
 * Marca a revisão como enviada, depois que a pessoa mandou a mensagem.
 *
 * A RPC move o pedido para `awaiting_confirmation`, marca a revisão como
 * `sent` e emite `order.sent`. Só depois disso o fornecedor consegue
 * confirmar, e só depois da confirmação dele o recebimento é liberado.
 *
 * O log da comunicação vem DEPOIS de marcar, e não antes: o estado do pedido é
 * o fato principal, e registrar um envio que a RPC recusou seria mentir no
 * histórico.
 */
export async function markOrderSent(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  const contactId = String(formData.get("contactId") ?? "").trim() || null;
  const channel = String(formData.get("channel") ?? "whatsapp");

  const supabase = await createServerSupabaseClient();
  const { data: revision, error: readError } = await supabase
    .from("order_revisions")
    .select(
      "id, orders!order_revisions_company_id_order_id_fkey ( supplier_id )",
    )
    .eq("company_id", company.companyId)
    .eq("id", revisionId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (readError || !revision) {
    return { error: "Revisão não encontrada neste pedido." };
  }

  const { error } = await supabase.rpc("rpc_mark_order_revision_sent", {
    p_company_id: company.companyId,
    p_order_revision_id: revisionId,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite enviar pedidos." };
    }
    if (error.message.includes("rascunho pode ser marcada")) {
      return { error: "Esta revisão já foi enviada." };
    }
    return { error: `Não foi possível marcar como enviado: ${error.message}` };
  }

  await logCommunication({
    companyId: company.companyId,
    supplierId: revision.orders.supplier_id,
    revisionId,
    contactId,
    channel: channel === "other" ? "other" : "whatsapp",
    // "manual" distingue no histórico o que uma pessoa mandou do que a
    // Evolution mandou sozinha — os dois viram linha na mesma tabela.
    provider: "manual",
    status: "sent",
  });

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}

/**
 * Envia o pedido pelo WhatsApp, pela Evolution.
 *
 * A ordem dos passos é a regra do documento mestre (seção 9): falha de
 * comunicação não pode corromper o pedido, e envio que não saiu não pode virar
 * pedido enviado.
 *
 *  1. gera o link — sem ele a mensagem não serve para confirmar nada;
 *  2. registra a tentativa como `queued`, ANTES de chamar a Evolution: se o
 *     processo morrer no meio, fica o rastro de que se tentou;
 *  3. chama a Evolution;
 *  4. fecha o log como `sent` com o id externo, ou como `failed` com o erro;
 *  5. só depois de um envio bem-sucedido marca a revisão como enviada.
 *
 * Falhou? O pedido continua em rascunho, o link gerado continua válido, e a
 * pessoa manda na mão. Nada precisa ser desfeito.
 */
export async function sendOrderWhatsApp(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.send")) {
    return { error: "Seu papel não permite enviar pedidos." };
  }
  if (!isEvolutionConfigured()) {
    return {
      error:
        "O envio automático não está configurado no servidor. Use a mensagem pronta e envie pelo WhatsApp.",
    };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  const contactId = String(formData.get("contactId") ?? "").trim();

  if (!contactId) {
    return { error: "Escolha para qual contato do fornecedor enviar." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: contact, error: contactError } = await supabase
    .from("supplier_contacts")
    .select("id, name, whatsapp, supplier_id")
    .eq("company_id", company.companyId)
    .eq("id", contactId)
    .eq("is_active", true)
    .maybeSingle();

  if (contactError || !contact) {
    return { error: "Contato não encontrado neste fornecedor." };
  }

  const phone = normalizePhone(contact.whatsapp);
  if (!phone) {
    return {
      error: `O WhatsApp de ${contact.name} não é um número válido. Corrija no cadastro do fornecedor.`,
    };
  }

  const link = await issueOrderLink(company.companyId, orderId, revisionId);
  if (!link.ok) return { error: link.error };
  if (!link.message) {
    return { error: "Não foi possível montar a mensagem deste pedido." };
  }

  const logId = await logCommunication({
    companyId: company.companyId,
    supplierId: link.supplierId,
    revisionId,
    contactId,
    channel: "whatsapp",
    provider: "evolution",
    status: "queued",
  });

  const envio = await sendWhatsAppText(phone, link.message);

  if (logId) {
    await updateCommunicationLog(company.companyId, logId, {
      status: envio.ok ? "sent" : "failed",
      externalMessageId: envio.ok ? envio.externalMessageId : null,
      errorMessage: envio.ok ? null : envio.error,
    });
  }

  if (!envio.ok) {
    return {
      error: `A mensagem não saiu: ${envio.error} O pedido continua em rascunho — o link já está gerado, dá para enviar na mão.`,
    };
  }

  const { error } = await supabase.rpc("rpc_mark_order_revision_sent", {
    p_company_id: company.companyId,
    p_order_revision_id: revisionId,
  });

  if (error) {
    // Caso incômodo e honesto: a mensagem saiu, mas o estado não avançou. Dizer
    // isso é melhor do que fingir sucesso ou fingir que nada aconteceu.
    return {
      error: `A mensagem foi enviada, mas o pedido não avançou de estado: ${error.message}`,
    };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
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
    const logistic = toDecimal(formData.get(`log_${id}`));
    const pricing = toDecimal(formData.get(`prec_${id}`));
    const price = toDecimal(formData.get(`preco_${id}`));
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

/**
 * Resolve uma divergência que o fornecedor relatou.
 *
 * Aceitar não altera o pedido sozinho: registra a decisão. Mudar quantidade
 * ou preço de fato exige nova revisão, que é fluxo próprio — por isso a
 * mensagem da tela não promete o que a RPC não faz.
 */
export async function resolveOrderDivergence(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const divergenceId = String(formData.get("divergenceId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!["accepted", "rejected", "resolved", "cancelled"].includes(status)) {
    return { error: "Escolha o que fazer com a divergência." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_resolve_order_divergence", {
    p_company_id: company.companyId,
    p_order_divergence_id: divergenceId,
    p_status: status,
    p_notes: notes || undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite resolver divergências." };
    }
    return { error: `Não foi possível resolver: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  return { error: null, savedAt: Date.now() };
}

/** Resolve a divergência de preço que o recebimento detectou sozinho. */
export async function resolveCommercialDivergence(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const divergenceId = String(formData.get("divergenceId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!["accepted", "to_dispute", "resolved", "justified"].includes(status)) {
    return { error: "Escolha o que fazer com a diferença de preço." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_resolve_commercial_divergence", {
    p_company_id: company.companyId,
    p_divergence_id: divergenceId,
    p_status: status,
    p_resolution_notes: notes || undefined,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite tratar divergências comerciais." };
    }
    return { error: `Não foi possível resolver: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Encerra o saldo não entregue.
 *
 * O fornecedor entregou 60 de 100 e avisou que o resto não vem. Em vez de
 * deixar o pedido pendente para sempre, encerra-se explicitamente: o pedido
 * vai para `received` e os números já recebidos ficam intocados. Por isso o
 * motivo é obrigatório — encerrar saldo é decisão, não conserto.
 */
export async function closeOrderBalance(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const company = await requireActiveCompany();

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 3) {
    return { error: "Explique por que o saldo está sendo encerrado." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_close_order_balance", {
    p_company_id: company.companyId,
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite encerrar saldo." };
    }
    if (error.message.includes("não possui saldo")) {
      return { error: "Este pedido não tem saldo a encerrar." };
    }
    return { error: `Não foi possível encerrar: ${error.message}` };
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
  return { error: null, savedAt: Date.now() };
}
