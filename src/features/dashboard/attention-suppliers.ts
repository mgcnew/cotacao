import "server-only";

import { cache } from "react";

import { listOrders } from "@/features/orders/queries";

/**
 * De quem são os pedidos de um item da lista de prioridades.
 *
 * Lê a MESMA lista que o item abre (`rpc_list_orders_page`, com o mesmo
 * recorte), então os nomes que aparecem na Central são os que a pessoa vai
 * encontrar ao clicar. Vem depois da lista, num `<Suspense>` próprio: a
 * prioridade aparece na hora e os nomes chegam em seguida.
 */
export type AttentionSuppliers = {
  /** Fornecedores distintos, na ordem da lista (pedido mais recente primeiro). */
  names: string[];
  /** A lista tem mais pedidos do que os lidos: pode haver outros nomes. */
  partial: boolean;
  /** Número do pedido, quando o recorte tem um só. */
  orderNumber: number | null;
};

export const getAttentionSuppliers = cache(
  async (companyId: string, situacao: string): Promise<AttentionSuppliers> => {
    const page = await listOrders(
      companyId,
      { situacao, fornecedorId: null, de: null, ate: null, numero: null },
      { page: 1, pageSize: 50 },
    );
    const names = [...new Set(page.rows.map((row) => row.supplierName))];

    return {
      names,
      // Pedidos além da primeira página podem ser de fornecedores novos; sem
      // contá-los, "e mais 2" mentiria para baixo. Na dúvida, não promete.
      partial: page.total > page.rows.length,
      orderNumber: page.total === 1 ? (page.rows[0]?.orderNumber ?? null) : null,
    };
  },
);
