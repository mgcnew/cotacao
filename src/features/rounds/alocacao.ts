import "server-only";

import { cache } from "react";

import {
  getAllocationBoard,
  listRoundOrders,
} from "@/features/allocations/queries";
import {
  carregarRodadaBasica,
  contarGruposAbertos,
} from "@/features/rounds/central";
import {
  IDADE_MAXIMA_DIAS,
  type UltimosPagosPorProduto,
} from "@/features/rounds/last-paid";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * O limite de compras que o cadastro guarda, por fornecedor da rodada.
 *
 * Também é apoio: se a leitura falhar, a decisão abre sem o aviso.
 */
async function listarLimites(
  companyId: string,
  supplierIds: string[],
): Promise<Map<string, number>> {
  const limites = new Map<string, number>();
  if (supplierIds.length === 0) return limites;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, purchase_limit")
    .eq("company_id", companyId)
    .in("id", supplierIds);
  if (error || !data) return limites;
  for (const row of data) {
    const limite = Number(row.purchase_limit);
    if (row.purchase_limit !== null && limite > 0) limites.set(row.id, limite);
  }
  return limites;
}

/**
 * O último preço efetivamente pago, por produto e fornecedor.
 *
 * É informação de apoio: se a leitura falhar, a decisão continua valendo sem
 * ela. Uma tela de decisão que não abre porque um indicador não carregou seria
 * pior que uma sem o indicador.
 */
async function listarUltimosPagos(
  companyId: string,
  productIds: string[],
): Promise<UltimosPagosPorProduto> {
  const pagos: UltimosPagosPorProduto = new Map();
  if (productIds.length === 0) return pagos;
  const supabase = await createServerSupabaseClient();
  const desde = new Date(Date.now() - IDADE_MAXIMA_DIAS * 86_400_000);
  const { data, error } = await supabase
    .from("v_latest_supplier_product_price")
    .select(
      "supplier_id, product_id, practiced_price, pricing_unit_symbol, occurred_at",
    )
    .eq("company_id", companyId)
    .in("product_id", productIds)
    .gte("occurred_at", desde.toISOString());
  if (error || !data) return pagos;
  for (const row of data) {
    if (
      !row.product_id ||
      !row.supplier_id ||
      row.practiced_price === null ||
      !row.pricing_unit_symbol ||
      !row.occurred_at
    )
      continue;
    const lista = pagos.get(row.product_id) ?? [];
    lista.push({
      price: Number(row.practiced_price),
      unit: row.pricing_unit_symbol,
      at: row.occurred_at,
      supplierId: row.supplier_id,
    });
    pagos.set(row.product_id, lista);
  }
  return pagos;
}

/**
 * A decisão de compra, para a página inteira e para o modal.
 *
 * PERMISSÃO VIRA DADO, NÃO DESVIO
 *
 * A página fazia `redirect` quando faltava `purchase_allocation.view`. Isso
 * não serve dentro da vaga do modal: o desvio arrasta o router inteiro, e a
 * lista atrás desapareceria por causa de uma caixa que nem abriu. Aqui a
 * permissão sai como `podeVer`, e quem desenha decide o que dizer — a tela
 * conta o que falta em vez de sumir.
 */
export const carregarAlocacao = cache(async (roundId: string) => {
  const company = await requireActiveCompany();

  const [round, board, orders, permissions, gruposAbertos] = await Promise.all([
    carregarRodadaBasica(roundId),
    getAllocationBoard(company.companyId, roundId),
    listRoundOrders(company.companyId, roundId),
    getPermissions(company.companyId),
    contarGruposAbertos(roundId),
  ]);

  if (!round) return null;

  const rascunhos = board.allocations.filter((a) => a.status === "draft");
  const [ultimosPagos, limites] = await Promise.all([
    listarUltimosPagos(company.companyId, [
      ...new Set(board.rows.map((row) => row.productId)),
    ]),
    listarLimites(company.companyId, [
      ...new Set(board.suppliers.map((supplier) => supplier.supplier_id)),
    ]),
  ]);

  return {
    companyName: company.companyName,
    round,
    rows: board.rows,
    suppliers: board.suppliers,
    allocationsByItem: board.allocationsByItem,
    orders,
    rascunhos,
    ultimosPagos,
    limites,
    fornecedoresNoRascunho: new Set(rascunhos.map((a) => a.supplierId)),
    supplierName: new Map(
      board.suppliers.map((s) => [s.supplier_id, s.suppliers.name]),
    ),
    /** Concluir a rodada, que a Decisão oferece quando tudo está decidido. */
    podeConcluir: permissions.has("purchase_round.close"),
    gruposAbertos,
    podeVer: permissions.has("purchase_allocation.view"),
    podeDecidir: permissions.has("purchase_allocation.create"),
    // Confirmar gera pedido: sem `order.create` a RPC recusaria no fim.
    podeConfirmar:
      permissions.has("purchase_allocation.confirm") &&
      permissions.has("order.create"),
  };
});

export type DadosDaAlocacao = NonNullable<
  Awaited<ReturnType<typeof carregarAlocacao>>
>;
