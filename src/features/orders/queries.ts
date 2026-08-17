import "server-only";

import { formatCnpj } from "@/features/company/cnpj";
import type { OrderFilters } from "@/features/orders/filters";
import type { OrderMessageContext } from "@/features/orders/message";
import { PEDIDO_EM_ANDAMENTO } from "@/features/orders/lifecycle";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Leituras de pedido.
 *
 * O ciclo de status é: `draft` → `awaiting_confirmation` (enviado ao
 * fornecedor) → `awaiting_delivery` (fornecedor confirmou) →
 * `partially_received` → `received`. Cada passo é de uma RPC diferente, e a
 * interface só mostra a ação que o estado atual permite.
 */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_confirmation: "Aguardando confirmação",
  awaiting_delivery: "Aguardando entrega",
  partially_received: "Recebido em parte",
  received: "Recebido",
  cancelled: "Cancelado",
};

/** Ciclo da revisão — documento mestre, 16.8. */
export const REVISION_STATUS_LABEL: Record<string, string> = {
  draft: "Em preparação",
  sent: "Enviada",
  confirmed: "Confirmada",
  contested: "Contestada",
  superseded: "Substituída",
  cancelled: "Cancelada",
};

/** Ciclo do recebimento — documento mestre, 16.9. */
export const RECEIPT_STATUS_LABEL: Record<string, string> = {
  draft: "Em registro",
  posted: "Registrado",
  voided: "Invalidado",
};

/**
 * O próximo passo do pedido, do ponto de vista de quem compra.
 *
 * A lista mostrava só o estado — e estado não diz o que fazer. Aqui se decide
 * o verbo e de quem é a vez, para que "Rascunho" apareça como "Enviar ao
 * fornecedor" e não como um rótulo parado. A ação em si continua morando na
 * página do pedido; isto só a anuncia.
 */
export type OrderNextStep = {
  label: string;
  /** Versão curta, para telas estreitas onde o rótulo inteiro não cabe. */
  shortLabel: string;
  /** Permissão exigida; `null` quando o passo não é do comprador. */
  permission: string | null;
  /** Verdadeiro quando o pedido está esperando alguém daqui agir. */
  pending: boolean;
};

export function orderNextStep(status: string): OrderNextStep {
  switch (status) {
    case "draft":
      return {
        label: "Enviar ao fornecedor",
        shortLabel: "Enviar",
        permission: "order.send",
        pending: true,
      };
    case "awaiting_delivery":
    case "partially_received":
      return {
        label: "Dar entrada",
        shortLabel: "Dar entrada",
        permission: "receipt.create",
        pending: true,
      };
    default:
      // Aguardando confirmação, recebido, cancelado: a vez não é nossa.
      return {
        label: "Abrir",
        shortLabel: "Abrir",
        permission: null,
        pending: false,
      };
  }
}

/**
 * O que o pedido direto precisa escolher: fornecedor e produto.
 *
 * Só entra o que a RPC aceita — fornecedor ativo e produto ativo —, senão a
 * tela ofereceria uma opção que o banco recusa no envio. As unidades vêm junto
 * apenas para rotular os campos; quem as grava no item é o servidor, lendo do
 * cadastro do produto.
 */
export async function listDirectOrderOptions(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const [suppliers, products] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("products")
      .select(
        `
        id,
        name,
        purchase_unit:units!products_company_id_purchase_unit_id_fkey ( symbol ),
        pricing_unit:units!products_company_id_pricing_unit_id_fkey ( symbol )
      `,
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (suppliers.error) {
    throw new Error(`Falha ao listar fornecedores: ${suppliers.error.message}`);
  }
  if (products.error) {
    throw new Error(`Falha ao listar produtos: ${products.error.message}`);
  }

  return {
    suppliers: suppliers.data ?? [],
    products: (products.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      purchaseUnit: p.purchase_unit?.symbol ?? "",
      pricingUnit: p.pricing_unit?.symbol ?? "",
    })),
  };
}

/** Teto de linhas. Acima disso a resposta é o filtro, não a rolagem. */
export const ORDERS_PAGE_SIZE = 200;

export type OrderListRow = {
  id: string;
  orderNumber: number;
  status: string;
  supplierName: string;
  roundTitle: string | null;
  deliveryDueDate: string | null;
  itemCount: number;
  total: number;
  /** Prazo vencido com mercadoria ainda por vir (documento mestre, 16.10). */
  isOverdue: boolean;
  overdueDays: number;
};

/**
 * Quem decide o que é atraso é `v_order_delivery_status`, não esta função.
 *
 * A regra já mora no banco, e repeti-la aqui criaria uma segunda verdade: foi
 * exatamente o que aconteceu antes da 0028, quando a tela contava três
 * situações e a view contava duas. Custa uma consulta a mais e vale a pena.
 *
 * O que não vale a pena é ela ser SEQUENCIAL. Antes esta consulta recebia os
 * ids da página e só podia sair depois que a lista voltasse — duas viagens em
 * fila, ~250 ms cada. Agora pergunta pelos atrasados da empresa inteira e sai
 * em paralelo com a lista; o cruzamento é feito aqui. São pedidos vencidos e
 * ainda não recebidos: uma lista curta por definição, porque atraso é coisa
 * que se resolve.
 */
async function readOverdue(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("v_order_delivery_status")
    .select("order_id, overdue_days")
    .eq("company_id", companyId)
    .eq("is_overdue", true);

  if (error) throw new Error(`Falha ao apurar atrasos: ${error.message}`);

  // Coluna de view chega tipada como anulável, mesmo vindo de `orders.id`, que
  // é chave primária. O filtro é para o compilador, não para os dados.
  return new Map(
    (data ?? [])
      .filter((r): r is { order_id: string; overdue_days: number } =>
        Boolean(r.order_id),
      )
      .map((r) => [r.order_id, Number(r.overdue_days)]),
  );
}

export async function listOrders(
  companyId: string,
  filters: OrderFilters = {
    situacao: null,
    fornecedorId: null,
    de: null,
    ate: null,
    numero: null,
  },
): Promise<{ rows: OrderListRow[]; truncated: boolean }> {
  const supabase = await createServerSupabaseClient();

  // Atraso e prazo do dia são condições da view, não colunas de `orders`.
  // Perguntar a ela quais pedidos se encaixam e restringir a lista a eles é
  // melhor do que trazer tudo e peneirar depois — assim o teto de linhas não
  // corta antes do filtro.
  let daView: string[] | null = null;
  if (filters.situacao === "atrasados" || filters.situacao === "entrega_hoje") {
    let consulta = supabase
      .from("v_order_delivery_status")
      .select("order_id")
      .eq("company_id", companyId);

    // Quem decide o que é "hoje" é a view, usando o fuso da empresa (0029).
    // Calcular a data aqui criaria uma terceira noção de hoje: a do servidor.
    consulta =
      filters.situacao === "atrasados"
        ? consulta.eq("is_overdue", true)
        : consulta.eq("is_due_today", true);

    const { data, error } = await consulta;
    if (error) throw new Error(`Falha ao apurar prazos: ${error.message}`);

    daView = (data ?? [])
      .map((r) => r.order_id)
      .filter((id): id is string => Boolean(id));
    if (daView.length === 0) return { rows: [], truncated: false };
  }

  let query = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      created_at,
      current_revision_id,
      suppliers!inner ( name ),
      purchase_rounds ( title ),
      order_revisions!order_revisions_company_id_order_id_fkey (
        id, revision_number, status, delivery_due_date,
        order_revision_items ( requested_quantity, agreed_price )
      )
    `,
    )
    .eq("company_id", companyId);

  if (daView) {
    query = query.in("id", daView);
  } else if (filters.situacao === "abertos") {
    query = query.in("status", [...PEDIDO_EM_ANDAMENTO, "draft"]);
  } else if (filters.situacao) {
    query = query.eq("status", filters.situacao);
  }

  if (filters.fornecedorId) query = query.eq("supplier_id", filters.fornecedorId);
  if (filters.numero) query = query.eq("order_number", filters.numero);
  if (filters.de) query = query.gte("created_at", `${filters.de}T00:00:00`);
  if (filters.ate) query = query.lte("created_at", `${filters.ate}T23:59:59`);

  // As duas saem juntas: a de atrasos não depende mais do resultado da lista.
  const [{ data, error }, atraso] = await Promise.all([
    query.order("order_number", { ascending: false }).limit(ORDERS_PAGE_SIZE + 1),
    readOverdue(supabase, companyId),
  ]);

  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);

  const truncated = (data ?? []).length > ORDERS_PAGE_SIZE;
  const pagina = (data ?? []).slice(0, ORDERS_PAGE_SIZE);

  const rows = pagina.map((order) => {
    // A vigente é a que `current_revision_id` aponta, não a de número mais
    // alto: uma revisão 2 ainda em rascunho não é o que o fornecedor recebeu,
    // e somar os itens dela mostraria um total que ninguém combinou.
    const revisions = order.order_revisions ?? [];
    const revision =
      revisions.find((r) => r.id === order.current_revision_id) ??
      [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0];
    const items = revision?.order_revision_items ?? [];

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      supplierName: order.suppliers.name,
      roundTitle: order.purchase_rounds?.title ?? null,
      deliveryDueDate: revision?.delivery_due_date ?? null,
      itemCount: items.length,
      total: items.reduce(
        (sum, i) => sum + Number(i.requested_quantity) * Number(i.agreed_price),
        0,
      ),
      isOverdue: atraso.has(order.id),
      overdueDays: atraso.get(order.id) ?? 0,
    };
  });

  return { rows, truncated };
}

/** Números do recorte, para o resumo no topo da lista. */
export function summarizeOrders(rows: OrderListRow[]) {
  return {
    quantidade: rows.length,
    valor: rows
      .filter((r) => r.status !== "cancelled")
      .reduce((sum, r) => sum + r.total, 0),
    rascunhos: rows.filter((r) => r.status === "draft").length,
    aguardandoConfirmacao: rows.filter(
      (r) => r.status === "awaiting_confirmation",
    ).length,
    aReceber: rows.filter(
      (r) =>
        r.status === "awaiting_delivery" || r.status === "partially_received",
    ).length,
    atrasados: rows.filter((r) => r.isOverdue).length,
  };
}

export async function getOrder(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      current_revision_id,
      suppliers!inner ( id, name ),
      purchase_rounds ( id, title )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar pedido: ${error.message}`);
  return data;
}

const REVISION_SELECT = `
  id,
  revision_number,
  status,
  delivery_due_date,
  sent_at,
  confirmed_at,
  order_revision_items (
    id, product_id, purchase_allocation_id, product_name_snapshot,
    requested_quantity, agreed_price, notes,
    purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
    pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol ),
    receipt_items ( logistic_quantity_received, pricing_quantity_received, practiced_price )
  )
`;

type RevisionRow = {
  id: string;
  revision_number: number;
  status: string;
  delivery_due_date: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  order_revision_items: {
    id: string;
    product_id: string;
    purchase_allocation_id: string | null;
    product_name_snapshot: string;
    requested_quantity: number;
    agreed_price: number;
    notes: string | null;
    purchase_unit: { symbol: string } | null;
    pricing_unit: { symbol: string } | null;
    receipt_items: { logistic_quantity_received: number }[] | null;
  }[];
};

function mapRevision(data: RevisionRow) {
  return {
    id: data.id,
    revisionNumber: data.revision_number,
    status: data.status,
    deliveryDueDate: data.delivery_due_date,
    sentAt: data.sent_at,
    confirmedAt: data.confirmed_at,
    items: (data.order_revision_items ?? []).map((item) => {
      // Um item pode ser recebido em várias remessas; o saldo é o que sobra.
      const recebido = (item.receipt_items ?? []).reduce(
        (sum, r) => sum + Number(r.logistic_quantity_received),
        0,
      );
      return {
        id: item.id,
        productId: item.product_id,
        allocationId: item.purchase_allocation_id,
        productName: item.product_name_snapshot,
        requestedQuantity: Number(item.requested_quantity),
        agreedPrice: Number(item.agreed_price),
        notes: item.notes,
        purchaseUnit: item.purchase_unit?.symbol ?? "",
        pricingUnit: item.pricing_unit?.symbol ?? "",
        receivedQuantity: recebido,
        pendingQuantity: Number(item.requested_quantity) - recebido,
      };
    }),
  };
}

export type OrderRevision = ReturnType<typeof mapRevision>;

/** Revisão vigente com seus itens e o quanto de cada um já foi recebido. */
export async function getCurrentRevision(
  companyId: string,
  orderId: string,
  revisionId: string | null,
) {
  if (!revisionId) return null;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("order_revisions")
    .select(REVISION_SELECT)
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a revisão: ${error.message}`);
  return data ? mapRevision(data) : null;
}

/**
 * A revisão em rascunho, se houver.
 *
 * Nem sempre é a vigente: `current_revision_id` só avança no envio, então um
 * pedido já enviado pode ter uma revisão 2 sendo preparada. É esta que a tela
 * deixa editar — a vigente já saiu daqui.
 */
export async function getDraftRevision(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("order_revisions")
    .select(REVISION_SELECT)
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .eq("status", "draft")
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar o rascunho: ${error.message}`);
  }
  return data ? mapRevision(data) : null;
}

/** Histórico: toda revisão que o pedido já teve, da mais nova para a mais velha. */
export async function listOrderRevisions(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("order_revisions")
    .select(
      `
      id, revision_number, status, delivery_due_date, sent_at, confirmed_at,
      order_revision_items ( requested_quantity, agreed_price )
    `,
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("revision_number", { ascending: false });

  if (error) throw new Error(`Falha ao listar revisões: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    revisionNumber: r.revision_number,
    status: r.status,
    deliveryDueDate: r.delivery_due_date,
    sentAt: r.sent_at,
    confirmedAt: r.confirmed_at,
    itemCount: r.order_revision_items?.length ?? 0,
    total: (r.order_revision_items ?? []).reduce(
      (sum, i) => sum + Number(i.requested_quantity) * Number(i.agreed_price),
      0,
    ),
  }));
}

/**
 * Tudo o que a mensagem do pedido precisa dizer, em uma leitura só.
 *
 * Empresa e CNPJ vêm junto porque o fornecedor recebe a mensagem em um número
 * de WhatsApp qualquer: sem dizer quem está pedindo, o texto é anônimo.
 */
export async function getOrderMessageContext(
  companyId: string,
  orderId: string,
  revisionId: string,
): Promise<OrderMessageContext | null> {
  const supabase = await createServerSupabaseClient();

  const [order, revision, company] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, suppliers!inner ( name )")
      .eq("company_id", companyId)
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_revisions")
      .select(
        `
        revision_number,
        delivery_due_date,
        order_revision_items (
          product_name_snapshot, requested_quantity, agreed_price,
          purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( symbol ),
          pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( symbol )
        )
      `,
      )
      .eq("company_id", companyId)
      .eq("order_id", orderId)
      .eq("id", revisionId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("name, legal_name, document_number")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  if (!order.data || !revision.data) return null;

  return {
    orderNumber: order.data.order_number,
    companyName:
      company.data?.legal_name ?? company.data?.name ?? "Nossa empresa",
    companyDocument: company.data?.document_number
      ? formatCnpj(company.data.document_number)
      : null,
    supplierName: order.data.suppliers.name,
    deliveryDueDate: revision.data.delivery_due_date,
    revisionNumber: revision.data.revision_number,
    items: (revision.data.order_revision_items ?? []).map((item) => ({
      productName: item.product_name_snapshot,
      requestedQuantity: Number(item.requested_quantity),
      agreedPrice: Number(item.agreed_price),
      purchaseUnit: item.purchase_unit?.symbol ?? "",
      pricingUnit: item.pricing_unit?.symbol ?? "",
    })),
  };
}

/**
 * Contatos do fornecedor com WhatsApp, para o envio.
 *
 * Só os ativos e só os que têm número: um contato sem WhatsApp não é destino
 * possível, e oferecê-lo na lista seria oferecer um caminho sem saída.
 */
export async function listOrderSendContacts(
  companyId: string,
  supplierId: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, name, role, whatsapp, is_primary")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .not("whatsapp", "is", null)
    .order("is_primary", { ascending: false })
    .order("name");

  if (error) throw new Error(`Falha ao listar contatos: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    whatsapp: c.whatsapp as string,
    isPrimary: c.is_primary,
  }));
}

export async function listOrderReceipts(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("id, status, received_at, notes, receipt_items ( id )")
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("received_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar recebimentos: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    receivedAt: r.received_at,
    notes: r.notes,
    itemCount: r.receipt_items?.length ?? 0,
  }));
}

/** Divergências relatadas pelo fornecedor no link do pedido. */
export async function listSupplierDivergences(
  companyId: string,
  orderId: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("order_divergences")
    .select(
      "id, type, status, notes, created_at, order_revision_item_id, resolved_at",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar divergências: ${error.message}`);
  }
  return data ?? [];
}

/** Divergências de preço detectadas automaticamente no recebimento. */
export async function listOrderDivergences(companyId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("commercial_divergences")
    .select(
      "id, type, status, agreed_value, realized_value, financial_impact, created_at",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar divergências: ${error.message}`);
  }
  return data ?? [];
}
