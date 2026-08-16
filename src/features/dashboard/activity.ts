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
  "negotiation.created": "Negociação registrada",
  "purchase.allocations_confirmed": "Compra confirmada e pedidos gerados",
  "order.created": "Pedido criado",
  "order.draft_updated": "Rascunho do pedido alterado",
  "order.revision_created": "Nova revisão de pedido",
  "order.sent": "Pedido enviado ao fornecedor",
  "order.confirmed": "Pedido confirmado pelo fornecedor",
  "order.cancelled": "Pedido cancelado",
  "order.divergence_created": "Fornecedor apontou divergência",
  "order.divergence_resolved": "Divergência do fornecedor resolvida",
  "order.balance_closed": "Saldo do pedido encerrado",
  "commercial_divergence.detected": "Preço da nota diferente do combinado",
  "commercial_divergence.status_changed": "Divergência de preço tratada",
  "receipt.posted": "Mercadoria recebida",
};

/**
 * Para onde o evento leva.
 *
 * Só há link quando o id do agregado é o id da tela. `round_supplier` e
 * `quotation_response_item`, por exemplo, não têm página própria — e mandar
 * para uma rota que não existe seria pior do que não linkar.
 */
function hrefFor(aggregateType: string, aggregateId: string): string | null {
  switch (aggregateType) {
    case "order":
      return `/pedidos/${aggregateId}`;
    case "purchase_round":
      return `/compras/${aggregateId}`;
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
    .select("id, event_type, aggregate_type, aggregate_id, actor_type, occurred_at, payload")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao ler atividade: ${error.message}`);

  return (data ?? []).map((e) => {
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const motivo =
      typeof payload.reason === "string" ? payload.reason : null;

    return {
      id: e.id,
      label: EVENT_LABEL[e.event_type] ?? e.event_type,
      detail: motivo,
      occurredAt: e.occurred_at,
      href: hrefFor(e.aggregate_type, e.aggregate_id),
      bySupplier: e.actor_type === "supplier",
    };
  });
}
