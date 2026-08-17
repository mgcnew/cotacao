import "server-only";

import { cache } from "react";

import { PEDIDO_EM_ANDAMENTO } from "@/features/orders/lifecycle";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * O retrato do dashboard, em uma ida ao banco.
 *
 * POR QUE UMA SÓ
 *
 * A tela fazia dezoito idas — quatorze delas contagens minúsculas, uma por
 * viagem. Instrumentando o `fetch` do client em produção, cada viagem custa
 * ~230 ms de rede; o Postgres responde em microssegundos. E disparadas em
 * rajada elas nem custam 230 ms cada: as que não cabem nas conexões já abertas
 * pagam TCP e TLS de novo, e apareciam com 600–780 ms.
 *
 * `rpc_dashboard_snapshot` devolve tudo numa linha. É o mesmo movimento da
 * `rpc_session_context`, pelo mesmo motivo: o custo não está na conta, está na
 * viagem.
 *
 * `cache()` do React garante que os três blocos do dashboard — pendências,
 * situação e primeiros passos — compartilhem a MESMA leitura dentro do mesmo
 * render, em vez de repeti-la três vezes.
 */

/** Quantos dias uma falha de envio continua sendo pendência. */
export const DIAS_DE_FALHA = 7;

export type RoundProgress = {
  roundId: string;
  title: string;
  totalSuppliers: number;
  suppliersPending: number;
  suppliersCompleted: number;
  ordersCreated: number;
};

export type DashboardSnapshot = {
  pedidosAtrasados: number;
  atrasoPiorDias: number;
  atrasoOrderId: string | null;
  entregasHoje: number;
  entregaHojeOrderId: string | null;
  pedidosRascunho: number;
  rascunhoOrderId: string | null;
  revisoesPendentes: number;
  revisaoOrderId: string | null;
  falhasEnvio: number;
  divergenciasComerciais: number;
  divergenciaComercialOrderId: string | null;
  divergenciasFornecedor: number;
  divergenciaFornecedorOrderId: string | null;
  pedidosEmAberto: number;
  itensSemAlocacao: number;
  produtosAtivos: number;
  fornecedoresAtivos: number;
  rodadasTotal: number;
  rodadas: RoundProgress[];
};

const VAZIO: DashboardSnapshot = {
  pedidosAtrasados: 0,
  atrasoPiorDias: 0,
  atrasoOrderId: null,
  entregasHoje: 0,
  entregaHojeOrderId: null,
  pedidosRascunho: 0,
  rascunhoOrderId: null,
  revisoesPendentes: 0,
  revisaoOrderId: null,
  falhasEnvio: 0,
  divergenciasComerciais: 0,
  divergenciaComercialOrderId: null,
  divergenciasFornecedor: 0,
  divergenciaFornecedorOrderId: null,
  pedidosEmAberto: 0,
  itensSemAlocacao: 0,
  produtosAtivos: 0,
  fornecedoresAtivos: 0,
  rodadasTotal: 0,
  rodadas: [],
};

/**
 * `rodadas` chega como `jsonb`, que o gerador de tipos declara como `Json`.
 * Conferir a forma aqui é o preço de trafegar um array dentro de uma linha —
 * e é barato perto de uma segunda viagem só para buscá-lo.
 */
function lerRodadas(valor: unknown): RoundProgress[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const r = item as Record<string, unknown>;
    if (typeof r.roundId !== "string") return [];
    return [
      {
        roundId: r.roundId,
        title: typeof r.title === "string" ? r.title : "Rodada",
        totalSuppliers: Number(r.totalSuppliers ?? 0),
        suppliersPending: Number(r.suppliersPending ?? 0),
        suppliersCompleted: Number(r.suppliersCompleted ?? 0),
        ordersCreated: Number(r.ordersCreated ?? 0),
      },
    ];
  });
}

export const getDashboardSnapshot = cache(
  async (companyId: string): Promise<DashboardSnapshot> => {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc("rpc_dashboard_snapshot", {
      p_company_id: companyId,
      p_dias_falha: DIAS_DE_FALHA,
      p_status_em_andamento: PEDIDO_EM_ANDAMENTO,
    });

    if (error) {
      throw new Error(`Falha ao ler o painel: ${error.message}`);
    }

    const linha = data?.[0];
    if (!linha) return VAZIO;

    return {
      pedidosAtrasados: linha.pedidos_atrasados ?? 0,
      atrasoPiorDias: linha.atraso_pior_dias ?? 0,
      atrasoOrderId: linha.atraso_order_id ?? null,
      entregasHoje: linha.entregas_hoje ?? 0,
      entregaHojeOrderId: linha.entrega_hoje_order_id ?? null,
      pedidosRascunho: linha.pedidos_rascunho ?? 0,
      rascunhoOrderId: linha.rascunho_order_id ?? null,
      revisoesPendentes: linha.revisoes_pendentes ?? 0,
      revisaoOrderId: linha.revisao_order_id ?? null,
      falhasEnvio: linha.falhas_envio ?? 0,
      divergenciasComerciais: linha.divergencias_comerciais ?? 0,
      divergenciaComercialOrderId: linha.divergencia_comercial_order_id ?? null,
      divergenciasFornecedor: linha.divergencias_fornecedor ?? 0,
      divergenciaFornecedorOrderId:
        linha.divergencia_fornecedor_order_id ?? null,
      pedidosEmAberto: linha.pedidos_em_aberto ?? 0,
      itensSemAlocacao: linha.itens_sem_alocacao ?? 0,
      produtosAtivos: linha.produtos_ativos ?? 0,
      fornecedoresAtivos: linha.fornecedores_ativos ?? 0,
      rodadasTotal: linha.rodadas_total ?? 0,
      rodadas: lerRodadas(linha.rodadas),
    };
  },
);
