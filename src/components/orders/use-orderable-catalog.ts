"use client";

import * as React from "react";

import type { OrderableProduct } from "@/components/orders/order-item-rows";
import { loadOrderableCatalog } from "@/features/orders/actions";

/**
 * O catálogo de produtos do pedido, buscado só quando alguém vai usá-lo.
 *
 * Antes ele ia dentro da página — ~300 KB e duas idas ao banco em toda abertura
 * de um pedido ou de uma conferência, para um seletor que quase nunca é aberto.
 * Agora cada tela pede no primeiro foco do campo, e o resultado fica guardado:
 * abrir outro pedido logo em seguida não repete a viagem.
 *
 * Os poucos minutos de validade existem porque um produto recém-cadastrado
 * precisa aparecer sem recarregar a página inteira.
 */
const VALIDADE_MS = 3 * 60 * 1000;
let guardado: { em: number; lista: Promise<OrderableProduct[]> } | null = null;

function buscar(): Promise<OrderableProduct[]> {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.lista;
  const lista = loadOrderableCatalog();
  guardado = { em: Date.now(), lista };
  // Falhou: não guarda, para a próxima tentativa buscar de novo.
  lista.catch(() => {
    if (guardado?.lista === lista) guardado = null;
  });
  return lista;
}

export type CatalogState = {
  products: OrderableProduct[];
  /** Pediu e ainda não chegou. */
  loading: boolean;
  failed: boolean;
  /** Começa a buscar (uma vez); pode ser chamado a cada foco sem custo. */
  load: () => void;
};

export function useOrderableCatalog({
  eager = false,
}: { eager?: boolean } = {}): CatalogState {
  const [products, setProducts] = React.useState<OrderableProduct[]>([]);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const started = React.useRef(false);

  const load = React.useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    buscar().then(
      (lista) => {
        setProducts(lista);
        setStatus("ready");
      },
      () => {
        started.current = false;
        setStatus("failed");
      },
    );
  }, []);

  // Tela em que a pessoa certamente vai escolher produtos (um pedido novo):
  // busca logo depois de abrir, sem segurar a renderização.
  React.useEffect(() => {
    if (!eager) return;
    const id = window.setTimeout(load, 300);
    return () => window.clearTimeout(id);
  }, [eager, load]);

  return {
    products,
    loading: status === "loading",
    failed: status === "failed",
    load,
  };
}
