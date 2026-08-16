import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Como estão as compras em andamento — documento mestre, 13.1.
 *
 * A Central de Atenção responde "o que preciso fazer"; isto responde "como
 * está". São coisas diferentes e ambas cabem na mesma tela: um pedido atrasado
 * é pendência, mas saber que há doze pedidos em aberto é situação, e não vira
 * tarefa de ninguém.
 *
 * Cada número é contado no banco (`count: "exact", head: true`), sem trazer as
 * linhas: a página precisa do total, não dos registros.
 */

export type SituationSummary = {
  rondasAtivas: number;
  /** Título da rodada quando há só uma — dá nome ao que está acontecendo. */
  rodadaUnica: { id: string; title: string } | null;
  fornecedoresPendentes: number;
  pedidosEmAberto: number;
  pedidosAtrasados: number;
};

const EM_ANDAMENTO = [
  "awaiting_confirmation",
  "awaiting_delivery",
  "partially_received",
];

export async function getSituationSummary(
  companyId: string,
  permissions: Set<string>,
): Promise<SituationSummary> {
  const supabase = await createServerSupabaseClient();
  const podeVerRodadas = permissions.has("purchase_round.view");
  const podeVerPedidos = permissions.has("order.view");

  const [rodadas, emAberto, atrasados] = await Promise.all([
    podeVerRodadas
      ? supabase
          .from("v_purchase_round_progress")
          .select("purchase_round_id, title, suppliers_pending")
          .eq("company_id", companyId)
          .eq("status", "active")
      : null,
    podeVerPedidos
      ? supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", EM_ANDAMENTO)
      : null,
    podeVerPedidos
      ? supabase
          .from("v_order_delivery_status")
          .select("order_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_overdue", true)
      : null,
  ]);

  if (rodadas?.error) {
    throw new Error(`Falha ao ler rodadas: ${rodadas.error.message}`);
  }
  if (emAberto?.error) {
    throw new Error(`Falha ao contar pedidos: ${emAberto.error.message}`);
  }
  if (atrasados?.error) {
    throw new Error(`Falha ao contar atrasos: ${atrasados.error.message}`);
  }

  const ativas = rodadas?.data ?? [];
  const unica = ativas.length === 1 ? ativas[0] : null;

  return {
    rondasAtivas: ativas.length,
    rodadaUnica:
      unica && unica.purchase_round_id
        ? { id: unica.purchase_round_id, title: unica.title ?? "Rodada" }
        : null,
    fornecedoresPendentes: ativas.reduce(
      (sum, r) => sum + Number(r.suppliers_pending ?? 0),
      0,
    ),
    pedidosEmAberto: emAberto?.count ?? 0,
    pedidosAtrasados: atrasados?.count ?? 0,
  };
}
