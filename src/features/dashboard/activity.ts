import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Atividade recente — documento mestre, 13.3, última linha: "terá prioridade
 * inferior às pendências acionáveis".
 *
 * Por isso mora no fim da página e é curta. Serve para responder "o que
 * andou acontecendo por aqui", não para virar tarefa: quem tem que agir já foi
 * avisado lá em cima, na Central de Atenção.
 *
 * A fonte é `domain_events`, que já registra tudo desde a 0012 e nunca havia
 * sido lido por nenhuma tela.
 */

export type ActivityEntry = {
  id: string;
  label: string;
  detail: string | null;
  occurredAt: string;
  href: string | null;
  /** Fornecedor agindo do lado de fora merece destaque na leitura. */
  bySupplier: boolean;
};

/**
 * O que cada evento significa em português.
 *
 * Evento sem rótulo aqui não é escondido: aparece com a chave crua, que é
 * feia mas verdadeira, e sinaliza que faltou traduzir um evento novo.
 */
const EVENT_LABEL: Record<string, string> = {
  "company.provisioned": "Empresa criada",
  "quotation.sent": "Cotação enviada ao fornecedor",
  "quotation.response_submitted": "Fornecedor respondeu a cotação",
  "quotation.response_corrected": "Resposta de fornecedor corrigida",
  // Lançada por quem compra, não pelo fornecedor — daí o rótulo separado de
  // "Fornecedor respondeu a cotação", que aqui seria mentira.
  "quotation.manual_response_recorded": "Preço lançado pelo comprador",
  "negotiation.created": "Negociação registrada",
  "purchase.allocations_confirmed": "Compra confirmada e pedidos gerados",
  "order.created": "Pedido criado",
  "order.draft_updated": "Rascunho do pedido alterado",
  "order.revision_created": "Nova revisão de pedido",
  "order.sent": "Pedido enviado ao fornecedor",
  "order.confirmed": "Pedido confirmado pelo fornecedor",
  "order.confirmed_manually": "Pedido confirmado manualmente",
  "order.cancelled": "Pedido cancelado",
  "order.divergence_created": "Fornecedor apontou divergência",
  "order.divergence_resolved": "Divergência do fornecedor resolvida",
  "order.balance_closed": "Saldo do pedido encerrado",
  "commercial_divergence.detected": "Preço da nota diferente do combinado",
  "commercial_divergence.status_changed": "Divergência de preço tratada",
  "receipt.posted": "Mercadoria recebida",
  "receipt.arrived": "Chegada do pedido registrada",
  // Ciclo de vida da rodada (0034). Sem estes, o feed mostrava a chave crua —
  // "purchase_round.cancelled" — que é o nome interno do evento, não notícia.
  "purchase_round.activated": "Rodada de compras iniciada",
  "purchase_round.completed": "Rodada de compras concluída",
  "purchase_round.cancelled": "Rodada de compras cancelada",
  "purchase_round_group.closed": "Grupo da rodada fechado",
  "purchase_round_group.cancelled": "Grupo da rodada cancelado",
  "round_supplier.added": "Fornecedor adicionado à cotação",
  "round_supplier.reactivated": "Fornecedor reativado na cotação",
  "round_supplier.groups_updated": "Produtos do fornecedor atualizados",
  "round_supplier.removed": "Fornecedor retirado da cotação",
};

const CHANNEL_LABEL: Record<string, string> = {
  phone: "telefone",
  whatsapp: "WhatsApp",
  email: "e-mail",
  in_person: "conversa presencial",
  other: "outro canal",
};

function countDetail(payload: Record<string, unknown>) {
  const answered = Number(payload.answered_items);
  const total = Number(payload.total_items);
  if (!Number.isFinite(answered) || !Number.isFinite(total)) return null;
  return `${answered} de ${total} ${total === 1 ? "produto respondido" : "produtos respondidos"}.`;
}

function labelFor(
  eventType: string,
  supplierName: string | null,
  orderNumber: number | null,
) {
  const supplier = supplierName ?? "O fornecedor";
  const orderRef = orderNumber === null ? "pedido" : `pedido #${orderNumber}`;
  const order = `o ${orderRef}`;
  switch (eventType) {
    case "quotation.sent":
      return supplierName
        ? `Cotação enviada para ${supplierName}`
        : EVENT_LABEL[eventType];
    case "quotation.response_submitted":
      return `${supplier} respondeu à cotação`;
    case "quotation.response_corrected":
      return `Resposta de ${supplierName ?? "fornecedor"} corrigida`;
    case "quotation.manual_response_recorded":
      return supplierName
        ? `Preço de ${supplierName} lançado pelo comprador`
        : EVENT_LABEL[eventType];
    case "order.confirmed":
      return `${supplier} confirmou ${order}`;
    case "order.confirmed_manually":
      return supplierName
        ? `Confirmação do ${orderRef} para ${supplierName} registrada manualmente`
        : EVENT_LABEL[eventType];
    case "order.created":
      return supplierName
        ? `${orderRef.charAt(0).toUpperCase()}${orderRef.slice(1)} criado para ${supplierName}`
        : EVENT_LABEL[eventType];
    case "order.draft_updated":
      return supplierName
        ? `Rascunho do ${orderRef} para ${supplierName} atualizado`
        : EVENT_LABEL[eventType];
    case "order.revision_created":
      return supplierName
        ? `Nova revisão do ${orderRef} para ${supplierName}`
        : EVENT_LABEL[eventType];
    case "order.sent":
      return supplierName
        ? `${orderRef.charAt(0).toUpperCase()}${orderRef.slice(1)} enviado para ${supplierName}`
        : EVENT_LABEL[eventType];
    case "order.cancelled":
      return supplierName
        ? `${orderRef.charAt(0).toUpperCase()}${orderRef.slice(1)} de ${supplierName} cancelado`
        : EVENT_LABEL[eventType];
    case "order.divergence_created":
      return `${supplier} informou uma divergência no ${orderRef}`;
    case "order.divergence_resolved":
      return supplierName
        ? `Divergência do ${orderRef} de ${supplierName} resolvida`
        : EVENT_LABEL[eventType];
    case "order.balance_closed":
      return supplierName
        ? `Saldo do ${orderRef} de ${supplierName} encerrado`
        : EVENT_LABEL[eventType];
    case "receipt.posted":
      return supplierName
        ? `Mercadoria do ${orderRef} de ${supplierName} recebida`
        : EVENT_LABEL[eventType];
    case "receipt.arrived":
      return supplierName
        ? `Chegada do ${orderRef} de ${supplierName} registrada`
        : EVENT_LABEL[eventType];
    case "round_supplier.added":
      return supplierName
        ? `${supplierName} foi adicionado à cotação`
        : EVENT_LABEL[eventType];
    case "round_supplier.reactivated":
      return supplierName
        ? `${supplierName} foi reativado na cotação`
        : EVENT_LABEL[eventType];
    case "round_supplier.groups_updated":
      return supplierName
        ? `Produtos enviados para ${supplierName} foram atualizados`
        : EVENT_LABEL[eventType];
    case "round_supplier.removed":
      return supplierName
        ? `${supplierName} foi retirado da cotação`
        : EVENT_LABEL[eventType];
    default:
      return EVENT_LABEL[eventType] ?? "Nova movimentação registrada";
  }
}

function detailFor(
  eventType: string,
  payload: Record<string, unknown>,
): string | null {
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  switch (eventType) {
    case "quotation.response_submitted":
      return countDetail(payload);
    case "round_supplier.added":
    case "round_supplier.reactivated":
    case "round_supplier.groups_updated": {
      const count = Number(payload.active_items);
      return Number.isFinite(count)
        ? `${count} ${count === 1 ? "produto selecionado" : "produtos selecionados"}.`
        : null;
    }
    case "order.confirmed_manually": {
      const channel =
        typeof payload.channel === "string"
          ? (CHANNEL_LABEL[payload.channel] ?? "outro canal")
          : "outro canal";
      const notes = typeof payload.notes === "string" ? payload.notes : null;
      return notes
        ? `Confirmação recebida por ${channel}. ${notes}`
        : `Confirmação recebida por ${channel}.`;
    }
    default:
      return reason;
  }
}

/**
 * Para onde o evento leva.
 *
 * Só há link quando o id do agregado é o id da tela. `round_supplier` e
 * `quotation_response_item`, por exemplo, não têm página própria — e mandar
 * para uma rota que não existe seria pior do que não linkar.
 */
function hrefFor(
  aggregateType: string,
  aggregateId: string,
  roundId: string | null,
): string | null {
  switch (aggregateType) {
    case "order":
      return `/pedidos/${aggregateId}`;
    case "purchase_round":
      return `/compras/${aggregateId}`;
    case "round_supplier":
      return roundId ? `/compras/${roundId}` : null;
    case "receipt":
      return `/recebimentos/${aggregateId}`;
    default:
      return null;
  }
}

export async function listRecentActivity(
  companyId: string,
  limit = 8,
): Promise<ActivityEntry[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("domain_events")
    .select(
      "id, event_type, aggregate_type, aggregate_id, actor_type, actor_supplier_id, occurred_at, payload",
    )
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao ler atividade: ${error.message}`);

  const events = data ?? [];
  const supplierIds = events
    .flatMap((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      return [event.actor_supplier_id, payload.supplier_id];
    })
    .filter((id): id is string => Boolean(id));
  const roundSupplierIds = events
    .filter((event) => event.aggregate_type === "round_supplier")
    .map((event) => event.aggregate_id);
  const orderIds = events
    .flatMap((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      return [
        event.aggregate_type === "order" ? event.aggregate_id : null,
        typeof payload.order_id === "string" ? payload.order_id : null,
      ];
    })
    .filter((id): id is string => Boolean(id));
  const [suppliers, roundSuppliers, orders] = await Promise.all([
    supplierIds.length
      ? supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", [...new Set(supplierIds)])
      : Promise.resolve({ data: [], error: null }),
    roundSupplierIds.length
      ? supabase
          .from("round_suppliers")
          .select("id, purchase_round_id, suppliers!inner(name)")
          .eq("company_id", companyId)
          .in("id", [...new Set(roundSupplierIds)])
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("orders")
          .select("id, order_number, suppliers!inner(name)")
          .eq("company_id", companyId)
          .in("id", [...new Set(orderIds)])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppliers.error) {
    throw new Error(
      `Falha ao identificar fornecedores: ${suppliers.error.message}`,
    );
  }
  if (roundSuppliers.error) {
    throw new Error(
      `Falha ao identificar cotações: ${roundSuppliers.error.message}`,
    );
  }
  if (orders.error) {
    throw new Error(`Falha ao identificar pedidos: ${orders.error.message}`);
  }

  const supplierNames = new Map(
    (suppliers.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const roundSupplierContext = new Map(
    (roundSuppliers.data ?? []).map((supplier) => [
      supplier.id,
      {
        name: supplier.suppliers.name,
        roundId: supplier.purchase_round_id,
      },
    ]),
  );
  const orderContext = new Map(
    (orders.data ?? []).map((order) => [
      order.id,
      {
        name: order.suppliers.name,
        orderNumber: order.order_number,
      },
    ]),
  );

  return events.map((e) => {
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const roundSupplier = roundSupplierContext.get(e.aggregate_id);
    const payloadOrderId =
      typeof payload.order_id === "string" ? payload.order_id : null;
    const order = orderContext.get(
      e.aggregate_type === "order" ? e.aggregate_id : (payloadOrderId ?? ""),
    );
    const payloadSupplierId =
      typeof payload.supplier_id === "string" ? payload.supplier_id : null;
    const supplierName =
      (e.actor_supplier_id ? supplierNames.get(e.actor_supplier_id) : null) ??
      roundSupplier?.name ??
      order?.name ??
      (payloadSupplierId ? supplierNames.get(payloadSupplierId) : null) ??
      null;

    return {
      id: e.id,
      label: labelFor(e.event_type, supplierName, order?.orderNumber ?? null),
      detail: detailFor(e.event_type, payload),
      occurredAt: e.occurred_at,
      href: hrefFor(
        e.aggregate_type,
        e.aggregate_id,
        roundSupplier?.roundId ?? null,
      ),
      bySupplier: e.actor_type === "supplier",
    };
  });
}
