import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Central de Atenção — documento mestre, 13.2.
 *
 * A pergunta que a página responde é "o que precisa de mim agora?". Cada item
 * daqui é uma CONDIÇÃO que persiste, não um evento que passou: a diferença
 * para o sino de notificações é essa. Pedido atrasado, por exemplo, nunca vira
 * notificação — a 0023 explica que atraso é condição de tempo, e só um lugar
 * que consulta o estado atual consegue mostrá-lo.
 *
 * Três regras que valem para todos os itens:
 *
 *  1. cada um leva à ação, e não só informa — por isso todos têm `href`, e ele
 *     aponta para o registro específico quando há apenas um;
 *  2. cada um exige a permissão de quem poderia agir. Esconder é cortesia,
 *     não segurança: quem contorna a tela esbarra na RLS do mesmo jeito;
 *  3. quantidade zero não vira item. Lista de pendências com "0 pendências"
 *     é ruído, e ruído ninguém lê.
 */

export type AttentionItem = {
  key: string;
  title: string;
  hint: string;
  count: number;
  severity: "high" | "normal";
  href: string;
  actionLabel: string;
};

/** Falha de comunicação velha já não é pendência: virou histórico. */
const DIAS_DE_FALHA = 7;

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

type Probe = () => Promise<AttentionItem | null>;

export async function getAttentionItems(
  companyId: string,
  permissions: Set<string>,
): Promise<AttentionItem[]> {
  const supabase = await createServerSupabaseClient();
  const podeVerPedidos = permissions.has("order.view");
  const podeVerRodadas = permissions.has("purchase_round.view");

  const probes: Probe[] = [];

  // ---- Pedidos atrasados -------------------------------------------------
  if (podeVerPedidos) {
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("v_order_delivery_status")
        .select("order_id, overdue_days", { count: "exact" })
        .eq("company_id", companyId)
        .eq("is_overdue", true)
        .order("overdue_days", { ascending: false })
        .limit(2);

      if (error) throw new Error(`Falha ao apurar atrasos: ${error.message}`);
      if (!count) return null;

      const pior = Number(data?.[0]?.overdue_days ?? 0);
      return {
        key: "pedidos-atrasados",
        title: plural(count, "pedido atrasado", "pedidos atrasados"),
        hint:
          count === 1
            ? `Prazo vencido há ${plural(pior, "dia", "dias")}.`
            : `O mais antigo está vencido há ${plural(pior, "dia", "dias")}.`,
        count,
        severity: "high",
        href:
          count === 1 && data?.[0]?.order_id
            ? `/pedidos/${data[0].order_id}`
            : "/pedidos?situacao=atrasados",
        actionLabel: "Cobrar entrega",
      };
    });

    // ---- Entrega prevista para hoje --------------------------------------
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("v_order_delivery_status")
        .select("order_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("is_due_today", true)
        .limit(2);

      if (error) throw new Error(`Falha ao apurar entregas: ${error.message}`);
      if (!count) return null;

      return {
        key: "entrega-hoje",
        title: plural(count, "entrega prevista", "entregas previstas") + " para hoje",
        hint: "Dar entrada assim que a mercadoria chegar.",
        count,
        severity: "normal",
        href:
          count === 1 && data?.[0]?.order_id
            ? `/pedidos/${data[0].order_id}`
            : "/pedidos?situacao=entrega_hoje",
        actionLabel: "Ver pedidos do dia",
      };
    });

    // ---- Pedidos em rascunho, nunca enviados -----------------------------
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("status", "draft")
        .limit(2);

      if (error) throw new Error(`Falha ao contar rascunhos: ${error.message}`);
      if (!count) return null;

      return {
        key: "pedidos-rascunho",
        title: plural(count, "pedido em rascunho", "pedidos em rascunho"),
        hint: "Gerado, mas ainda não enviado ao fornecedor.",
        count,
        severity: "normal",
        href:
          count === 1 && data?.[0]?.id
            ? `/pedidos/${data[0].id}`
            : "/pedidos?situacao=draft",
        actionLabel: "Enviar",
      };
    });

    // ---- Revisão preparada e não enviada ---------------------------------
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("order_revisions")
        .select("order_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("status", "draft")
        .gt("revision_number", 1)
        .limit(2);

      if (error) throw new Error(`Falha ao contar revisões: ${error.message}`);
      if (!count) return null;

      return {
        key: "revisoes-pendentes",
        title: plural(count, "revisão aguardando", "revisões aguardando") + " envio",
        hint: "O fornecedor ainda está com a versão anterior do pedido.",
        count,
        severity: "high",
        href:
          count === 1 && data?.[0]?.order_id
            ? `/pedidos/${data[0].order_id}`
            : "/pedidos?situacao=abertos",
        actionLabel: "Enviar revisão",
      };
    });

    // ---- Falha de envio --------------------------------------------------
    probes.push(async () => {
      const desde = new Date(
        Date.now() - DIAS_DE_FALHA * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { count, error } = await supabase
        .from("communication_logs")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "failed")
        .gte("created_at", desde);

      if (error) throw new Error(`Falha ao ler comunicações: ${error.message}`);
      if (!count) return null;

      return {
        key: "falhas-de-envio",
        title: plural(count, "envio que falhou", "envios que falharam"),
        hint: `Nos últimos ${DIAS_DE_FALHA} dias. A mensagem não chegou ao fornecedor.`,
        count,
        severity: "high",
        href: "/pedidos?situacao=abertos",
        actionLabel: "Reenviar",
      };
    });
  }

  // ---- Divergência comercial pendente ------------------------------------
  if (permissions.has("commercial_divergence.view")) {
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("commercial_divergences")
        .select("order_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .limit(2);

      if (error) {
        throw new Error(`Falha ao contar divergências: ${error.message}`);
      }
      if (!count) return null;

      return {
        key: "divergencias-comerciais",
        title:
          plural(count, "divergência", "divergências") + " de preço a resolver",
        hint: "A nota veio diferente do combinado e ninguém decidiu o que fazer.",
        count,
        severity: "high",
        href:
          count === 1 && data?.[0]?.order_id
            ? `/pedidos/${data[0].order_id}`
            : "/pedidos",
        actionLabel: "Tratar",
      };
    });
  }

  // ---- Divergência apontada pelo fornecedor ------------------------------
  if (permissions.has("order.revise")) {
    probes.push(async () => {
      const { data, count, error } = await supabase
        .from("order_divergences")
        .select("order_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .limit(2);

      if (error) {
        throw new Error(`Falha ao contar divergências: ${error.message}`);
      }
      if (!count) return null;

      return {
        key: "divergencias-fornecedor",
        title:
          plural(count, "divergência apontada", "divergências apontadas") +
          " pelo fornecedor",
        hint: "Enquanto não for resolvida, o pedido não avança para entrega.",
        count,
        severity: "high",
        href:
          count === 1 && data?.[0]?.order_id
            ? `/pedidos/${data[0].order_id}`
            : "/pedidos?situacao=abertos",
        actionLabel: "Responder",
      };
    });
  }

  // ---- Rodadas: sem resposta, aguardando fechamento, sem alocação --------
  // Uma leitura só, compartilhada pelas três sondas que dependem dela.
  const rodadas = podeVerRodadas
    ? await listActiveRoundProgress(companyId)
    : [];

  if (podeVerRodadas) {
    probes.push(async () => {
      const pendentes = rodadas.filter((r) => r.suppliersPending > 0);
      if (pendentes.length === 0) return null;

      const total = pendentes.reduce((sum, r) => sum + r.suppliersPending, 0);
      return {
        key: "fornecedores-sem-resposta",
        title: plural(total, "fornecedor sem responder", "fornecedores sem responder"),
        hint:
          pendentes.length === 1
            ? `Na rodada "${pendentes[0].title}".`
            : `Em ${plural(pendentes.length, "rodada", "rodadas")} em andamento.`,
        count: total,
        severity: "normal",
        href:
          pendentes.length === 1
            ? `/compras/${pendentes[0].roundId}`
            : "/compras",
        actionLabel: "Cobrar resposta",
      };
    });

    probes.push(async () => {
      // Todo mundo respondeu e nenhum pedido saiu: a rodada está esperando
      // alguém decidir a compra.
      const prontas = rodadas.filter(
        (r) =>
          r.totalSuppliers > 0 &&
          r.suppliersPending === 0 &&
          r.ordersCreated === 0,
      );
      if (prontas.length === 0) return null;

      return {
        key: "rodadas-para-fechar",
        title:
          plural(prontas.length, "rodada pronta", "rodadas prontas") +
          " para fechar",
        hint: "Todos responderam e nenhum pedido foi gerado ainda.",
        count: prontas.length,
        severity: "high",
        href:
          prontas.length === 1
            ? `/compras/${prontas[0].roundId}/alocacao`
            : "/compras",
        actionLabel: "Decidir compra",
      };
    });

    probes.push(async () => {
      // Só faz sentido cobrar alocação onde já existe resposta para comparar;
      // rodada recém-enviada tem tudo em aberto, e isso não é pendência.
      const comResposta = rodadas
        .filter((r) => r.suppliersCompleted > 0)
        .map((r) => r.roundId);
      if (comResposta.length === 0) return null;

      const { count, error } = await supabase
        .from("quotation_items")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("commercial_status", "open")
        .in("purchase_round_id", comResposta);

      if (error) throw new Error(`Falha ao contar itens: ${error.message}`);
      if (!count) return null;

      return {
        key: "itens-sem-alocacao",
        title: plural(count, "item sem decisão", "itens sem decisão") + " de compra",
        hint: "Já há resposta de fornecedor, mas ninguém escolheu de quem comprar.",
        count,
        severity: "normal",
        href:
          comResposta.length === 1
            ? `/compras/${comResposta[0]}/alocacao`
            : "/compras",
        actionLabel: "Alocar",
      };
    });
  }

  const itens = (await Promise.all(probes.map((probe) => probe()))).filter(
    (item): item is AttentionItem => item !== null,
  );

  // Urgente primeiro; dentro da mesma urgência, o que tem mais casos.
  return itens.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.count - a.count;
  });
}

type RoundProgress = {
  roundId: string;
  title: string;
  totalSuppliers: number;
  suppliersPending: number;
  suppliersCompleted: number;
  ordersCreated: number;
};

/**
 * Progresso das rodadas em andamento, lido de `v_purchase_round_progress`.
 *
 * Lido uma vez e passado às sondas que precisam dele. Guardar em cache de
 * módulo seria pior de duas formas: serviria dado velho na visita seguinte, e
 * um cache por empresa atravessaria requisições de usuários diferentes.
 */
async function listActiveRoundProgress(
  companyId: string,
): Promise<RoundProgress[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_purchase_round_progress")
    .select(
      "purchase_round_id, title, total_suppliers, suppliers_pending, suppliers_completed, orders_created",
    )
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error) throw new Error(`Falha ao ler rodadas: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.purchase_round_id !== null)
    .map((r) => ({
      roundId: r.purchase_round_id as string,
      title: r.title ?? "Rodada",
      totalSuppliers: Number(r.total_suppliers ?? 0),
      suppliersPending: Number(r.suppliers_pending ?? 0),
      suppliersCompleted: Number(r.suppliers_completed ?? 0),
      ordersCreated: Number(r.orders_created ?? 0),
    }));
}
