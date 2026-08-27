import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Notificações do usuário.
 *
 * A RLS de `notifications` só devolve as do próprio usuário (`user_id =
 * auth.uid()`), então não há filtro por usuário aqui — pedir ao banco o que
 * ele já garante seria redundância que engana o leitor.
 *
 * Quem cria é o gatilho `domain_events_fanout_notification`. O app tem apenas
 * SELECT e UPDATE: lê as suas e marca como lida.
 */

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  priority: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function responseMessage(metadata: Record<string, unknown>) {
  const answered = Number(metadata.answered_items);
  const total = Number(metadata.total_items);
  if (!Number.isFinite(answered) || !Number.isFinite(total)) {
    return "A resposta já está disponível para conferência.";
  }
  return `${answered} de ${total} ${total === 1 ? "produto foi respondido" : "produtos foram respondidos"}.`;
}

function divergenceMessage(metadata: Record<string, unknown>) {
  const count = Number(metadata.count ?? 1);
  return `${count} ${count === 1 ? "ponto precisa" : "pontos precisam"} ser conferido${count === 1 ? "" : "s"} antes da entrega.`;
}

export async function listNotifications(
  companyId: string,
  limit = 20,
): Promise<Notification[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, title, message, priority, action_url, read_at, created_at, resource_type, resource_id, metadata",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new Error(`Falha ao carregar notificações: ${error.message}`);

  const notifications = data ?? [];
  const roundSupplierIds = notifications
    .filter(
      (notification) =>
        notification.type === "quotation.response_submitted" &&
        notification.resource_type === "round_supplier",
    )
    .map((notification) => notification.resource_id)
    .filter((id): id is string => Boolean(id));
  const orderIds = notifications
    .filter(
      (notification) =>
        ["order.confirmed", "order.divergence_created"].includes(
          notification.type,
        ) && notification.resource_type === "order",
    )
    .map((notification) => notification.resource_id)
    .filter((id): id is string => Boolean(id));
  const [roundSuppliers, orders] = await Promise.all([
    roundSupplierIds.length
      ? supabase
          .from("round_suppliers")
          .select("id, suppliers!inner(name)")
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
  if (roundSuppliers.error) {
    throw new Error(
      `Falha ao identificar fornecedores das notificações: ${roundSuppliers.error.message}`,
    );
  }
  if (orders.error) {
    throw new Error(
      `Falha ao identificar pedidos das notificações: ${orders.error.message}`,
    );
  }

  const supplierByRoundSupplier = new Map(
    (roundSuppliers.data ?? []).map((row) => [row.id, row.suppliers.name]),
  );
  const orderContext = new Map(
    (orders.data ?? []).map((row) => [
      row.id,
      { supplierName: row.suppliers.name, orderNumber: row.order_number },
    ]),
  );

  return notifications.map((notification) => {
    const metadata = metadataRecord(notification.metadata);
    const roundSupplierName = notification.resource_id
      ? supplierByRoundSupplier.get(notification.resource_id)
      : undefined;
    const order = notification.resource_id
      ? orderContext.get(notification.resource_id)
      : undefined;
    let title = notification.title;
    let message = notification.message;

    switch (notification.type) {
      case "quotation.response_submitted":
        title = `${roundSupplierName ?? "Um fornecedor"} respondeu à cotação`;
        message = responseMessage(metadata);
        break;
      case "order.confirmed":
        title = order
          ? `${order.supplierName} confirmou o pedido #${order.orderNumber}`
          : "Pedido confirmado pelo fornecedor";
        message =
          "O pedido está confirmado e já pode seguir para o recebimento.";
        break;
      case "order.divergence_created":
        title = order
          ? `${order.supplierName} informou uma divergência no pedido #${order.orderNumber}`
          : "Fornecedor informou uma divergência no pedido";
        message = divergenceMessage(metadata);
        break;
      case "commercial_divergence.detected":
        title = "Preço da nota diferente do combinado";
        message = `Preço combinado: ${String(metadata.agreed_price ?? "não informado")}. Preço na nota: ${String(metadata.practiced_price ?? "não informado")}.`;
        break;
      case "receipt.arrived":
        title = "Mercadoria aguardando conferência";
        break;
    }

    return {
      id: notification.id,
      type: notification.type,
      title,
      message,
      priority: notification.priority,
      actionUrl: notification.action_url,
      readAt: notification.read_at,
      createdAt: notification.created_at,
    };
  });
}

export async function countUnread(companyId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("read_at", null);

  if (error) throw new Error(`Falha ao contar notificações: ${error.message}`);
  return count ?? 0;
}
