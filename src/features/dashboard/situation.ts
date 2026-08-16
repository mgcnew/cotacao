import "server-only";

import type { FirstStep } from "@/components/dashboard/first-steps";
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

/**
 * Os passos até a primeira cotação.
 *
 * A ordem é a que o sistema exige, não uma sugestão: item de cotação grava as
 * unidades do produto, e rodada sem fornecedor não tem a quem perguntar preço.
 * Cada passo é marcado como feito olhando o que já existe — a lista não pede
 * duas vezes o que a pessoa já fez.
 *
 * Passo que a pessoa não tem permissão de executar fica de fora: mandar alguém
 * a uma tela que vai recusá-la é pior do que omitir o passo.
 */
export async function getFirstSteps(
  companyId: string,
  permissions: Set<string>,
): Promise<FirstStep[]> {
  const supabase = await createServerSupabaseClient();

  const [produtos, fornecedores, rodadas] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("purchase_rounds")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
  ]);

  const passos: FirstStep[] = [];

  if (permissions.has("product.view")) {
    passos.push({
      label: "Cadastrar produtos",
      hint: "O item da cotação grava as unidades do cadastro do produto.",
      href: "/produtos",
      done: (produtos.count ?? 0) > 0,
    });
  }

  if (permissions.has("supplier.view")) {
    passos.push({
      label: "Cadastrar fornecedores",
      hint: "Com contato de WhatsApp, é para lá que a cotação vai.",
      href: "/fornecedores",
      done: (fornecedores.count ?? 0) > 0,
    });
  }

  if (permissions.has("purchase_round.create")) {
    passos.push({
      label: "Abrir a primeira rodada de compras",
      hint: "Reúne os produtos, convida os fornecedores e compara os preços.",
      href: "/compras/nova",
      done: (rodadas.count ?? 0) > 0,
    });
  }

  if (permissions.has("order.create")) {
    passos.push({
      label: "Ou lançar um pedido direto",
      hint: "Para a compra que já foi fechada por telefone, sem cotar.",
      href: "/pedidos/novo",
      done: false,
    });
  }

  return passos;
}
