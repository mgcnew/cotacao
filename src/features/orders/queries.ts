import "server-only";

import { formatCnpj } from "@/features/company/cnpj";
import type { OrderFilters } from "@/features/orders/filters";
import type { OrderMessageContext } from "@/features/orders/message";
import { listPendingShoppingItems } from "@/features/shopping-list/queries";
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

  const [suppliers, products, shoppingItems, supplierNotices] =
    await Promise.all([
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
      listPendingShoppingItems(companyId),
      supabase
        .from("supplier_notices")
        .select("id, supplier_id, kind, title, amount, due_date, priority")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("priority")
        .order("created_at", { ascending: false }),
    ]);

  if (suppliers.error) {
    throw new Error(`Falha ao listar fornecedores: ${suppliers.error.message}`);
  }
  if (products.error) {
    throw new Error(`Falha ao listar produtos: ${products.error.message}`);
  }
  if (supplierNotices.error) {
    throw new Error(`Falha ao listar avisos: ${supplierNotices.error.message}`);
  }

  const noticesBySupplier = new Map<
    string,
    NonNullable<typeof supplierNotices.data>
  >();
  for (const notice of supplierNotices.data ?? []) {
    const current = noticesBySupplier.get(notice.supplier_id) ?? [];
    current.push(notice);
    noticesBySupplier.set(notice.supplier_id, current);
  }

  return {
    suppliers: (suppliers.data ?? []).map((supplier) => ({
      ...supplier,
      openNotices: (noticesBySupplier.get(supplier.id) ?? []).map((notice) => ({
        id: notice.id,
        kind: notice.kind,
        title: notice.title,
        amount: notice.amount,
        dueDate: notice.due_date,
        priority: notice.priority,
      })),
    })),
    products: (products.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      purchaseUnit: p.purchase_unit?.symbol ?? "",
      pricingUnit: p.pricing_unit?.symbol ?? "",
    })),
    shoppingItems,
  };
}

/** Catálogo mínimo usado para editar ou revisar um pedido existente. */
/**
 * Catálogo ativo para editar um rascunho ou abrir uma revisão.
 *
 * Pagina por `range`: sem isso o PostgREST devolve só as mil primeiras linhas
 * e o item que falta no pedido pode ser justamente um dos que não vieram.
 */
export async function listOrderEditableProducts(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const data = [];

  for (let start = 0; ; start += 1000) {
    const page = await supabase
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
      .order("name")
      .order("id")
      .range(start, start + 999);

    if (page.error) {
      throw new Error(`Falha ao listar produtos: ${page.error.message}`);
    }
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  return data.map((product) => ({
    id: product.id,
    name: product.name,
    purchaseUnit: product.purchase_unit?.symbol ?? "",
    pricingUnit: product.pricing_unit?.symbol ?? "",
  }));
}

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

export type OrderListSummary = {
  quantity: number;
  value: number;
  drafts: number;
  awaitingConfirmation: number;
  toReceive: number;
  overdue: number;
};

type OrderPagePayload = {
  rows: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: OrderListSummary;
};

export async function listOrders(
  companyId: string,
  filters: OrderFilters = {
    situacao: null,
    fornecedorId: null,
    de: null,
    ate: null,
    numero: null,
  },
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 10 },
): Promise<OrderPagePayload> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rpc_list_orders_page", {
    p_company_id: companyId,
    p_page: pagination.page,
    p_page_size: pagination.pageSize,
    p_situation: filters.situacao ?? undefined,
    p_supplier_id: filters.fornecedorId ?? undefined,
    p_from: filters.de ?? undefined,
    p_to: filters.ate ?? undefined,
    p_order_number: filters.numero ?? undefined,
  });

  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
  const payload = data as unknown as OrderPagePayload | null;
  if (!payload || !Array.isArray(payload.rows) || !payload.summary) {
    throw new Error("Falha ao listar pedidos: resposta inválida do banco.");
  }

  return {
    rows: payload.rows.map((row) => ({
      ...row,
      orderNumber: Number(row.orderNumber),
      itemCount: Number(row.itemCount),
      total: Number(row.total),
      overdueDays: Number(row.overdueDays),
    })),
    total: Number(payload.total),
    page: Number(payload.page),
    pageSize: Number(payload.pageSize),
    summary: {
      quantity: Number(payload.summary.quantity),
      value: Number(payload.summary.value),
      drafts: Number(payload.summary.drafts),
      awaitingConfirmation: Number(payload.summary.awaitingConfirmation),
      toReceive: Number(payload.summary.toReceive),
      overdue: Number(payload.summary.overdue),
    },
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
      suppliers!inner ( id, name, document_number ),
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
  confirmation_source,
  confirmation_channel,
  confirmation_notes,
  order_revision_items (
    id, product_id, purchase_allocation_id, product_name_snapshot,
    requested_quantity, agreed_price, notes,
    purchase_unit:units!order_revision_items_company_id_purchase_unit_id_fkey ( id, symbol ),
    pricing_unit:units!order_revision_items_company_id_pricing_unit_id_fkey ( id, symbol ),
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
  confirmation_source: string | null;
  confirmation_channel: string | null;
  confirmation_notes: string | null;
  order_revision_items: {
    id: string;
    product_id: string;
    purchase_allocation_id: string | null;
    product_name_snapshot: string;
    requested_quantity: number;
    agreed_price: number;
    notes: string | null;
    purchase_unit: { id: string; symbol: string } | null;
    pricing_unit: { id: string; symbol: string } | null;
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
    confirmationSource: data.confirmation_source,
    confirmationChannel: data.confirmation_channel,
    confirmationNotes: data.confirmation_notes,
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
        purchaseUnitId: item.purchase_unit?.id ?? "",
        pricingUnitId: item.pricing_unit?.id ?? "",
        sameUnit:
          Boolean(item.purchase_unit?.id) &&
          item.purchase_unit?.id === item.pricing_unit?.id,
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
      confirmation_source, confirmation_channel, confirmation_notes,
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
    confirmationSource: r.confirmation_source,
    confirmationChannel: r.confirmation_channel,
    confirmationNotes: r.confirmation_notes,
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
    .select(
      "id, status, received_at, checked_at, invoice_number, invoice_total, notes, receipt_items ( id )",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("received_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar recebimentos: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    receivedAt: r.received_at,
    checkedAt: r.checked_at,
    invoiceNumber: r.invoice_number,
    invoiceTotal: r.invoice_total === null ? null : Number(r.invoice_total),
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
