import "server-only";

import { cache } from "react";

import {
  getAllocationBoard,
  listRoundOrders,
} from "@/features/allocations/queries";
import { carregarRodadaBasica } from "@/features/rounds/central";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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

  const [round, board, orders, permissions] = await Promise.all([
    carregarRodadaBasica(roundId),
    getAllocationBoard(company.companyId, roundId),
    listRoundOrders(company.companyId, roundId),
    getPermissions(company.companyId),
  ]);

  if (!round) return null;

  const rascunhos = board.allocations.filter((a) => a.status === "draft");

  return {
    round,
    rows: board.rows,
    suppliers: board.suppliers,
    allocationsByItem: board.allocationsByItem,
    orders,
    rascunhos,
    fornecedoresNoRascunho: new Set(rascunhos.map((a) => a.supplierId)),
    supplierName: new Map(
      board.suppliers.map((s) => [s.supplier_id, s.suppliers.name]),
    ),
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
