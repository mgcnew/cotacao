"use client";

import * as React from "react";

import {
  MobileQuickAdd,
  QuantityStepper,
  type QuickAddTexts,
} from "@/components/shopping-list/mobile-quick-add";
import {
  refreshRound,
  setRoundItemQuantity,
  setRoundLineQuantity,
} from "@/features/rounds/actions";
import type { ShoppingProduct } from "@/features/shopping-list/queries";

/** Pausa antes de salvar: três toques em + viram uma chamada só. */
const SAVE_DELAY_MS = 350;

const ROUND_TEXTS: QuickAddTexts = {
  trigger: "Buscar produto para cotar",
  title: "Adicionar à rodada",
  description:
    "Busque o produto pelo nome ou pelo código de barras e toque nele para colocá-lo na rodada.",
  added: "Na rodada",
  addAction: "Adicionar à rodada",
  hint: "Digite o nome do produto ou toque na câmera para bipar o código. Cada toque coloca 1 na rodada; ajuste a quantidade no próprio item.",
  scanned: "na rodada",
  updated: (count) =>
    count === 1
      ? "Rodada atualizada: 1 produto"
      : `Rodada atualizada: ${count} produtos`,
};

export type MobileRoundItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  /** Forma de compra do item ("cx"); nula na unidade de compra do produto. */
  purchaseFormId: string | null;
};

/**
 * Adicionar produtos à rodada no celular: a mesma folha da lista de compras,
 * gravando na rodada. Sem barra presa ao topo — a montagem mora dentro de um
 * passo (e às vezes de um modal), onde o `sticky` da lista não se encaixa.
 */
export function MobileRoundQuickAdd({
  roundId,
  products,
  items,
}: {
  roundId: string;
  products: ShoppingProduct[];
  items: MobileRoundItem[];
}) {
  const save = React.useCallback(
    (productId: string, quantity: number, purchaseFormId: string | null) =>
      setRoundItemQuantity(roundId, productId, quantity, purchaseFormId),
    [roundId],
  );
  const refresh = React.useCallback(() => refreshRound(roundId), [roundId]);

  return (
    <MobileQuickAdd
      products={products}
      pending={items.map((item) => ({
        productId: item.productId,
        purchaseFormId: item.purchaseFormId,
        quantity: item.quantity,
      }))}
      save={save}
      refresh={refresh}
      texts={ROUND_TEXTS}
      barClassName="mb-3 flex gap-2 sm:hidden"
    />
  );
}

function ItemRow({
  roundId,
  item,
}: {
  roundId: string;
  item: MobileRoundItem;
}) {
  const [quantity, setQuantity] = React.useState(item.quantity);
  const [gone, setGone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const quantityRef = React.useRef(item.quantity);
  const confirmedRef = React.useRef(item.quantity);
  const timerRef = React.useRef<number | null>(null);

  const save = React.useCallback(async () => {
    timerRef.current = null;
    const wanted = quantityRef.current;
    let failure: string | null = null;
    try {
      const result = await setRoundLineQuantity(roundId, item.id, wanted);
      if (result.error) failure = result.error;
      else confirmedRef.current = wanted;
    } catch {
      failure = "Sem conexão com o servidor. A quantidade não foi salva.";
    }
    if (failure) {
      if (timerRef.current === null) {
        quantityRef.current = confirmedRef.current;
        setQuantity(confirmedRef.current);
        setGone(false);
      }
      setError(failure);
      return;
    }
    if (timerRef.current === null) await refreshRound(roundId);
  }, [roundId, item.id]);

  // Sair da tela dentro da pausa não pode perder o último toque.
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        void save();
      }
    };
  }, [save]);

  function change(next: number) {
    setError(null);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    quantityRef.current = next;
    if (next === 0) {
      // Zero tira da rodada na hora: esperar a pausa deixaria a linha ali.
      timerRef.current = null;
      setGone(true);
      void save();
      return;
    }
    setQuantity(next);
    timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  if (gone) return null;

  return (
    <li className="border-border border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
            {item.name}
          </p>
          {item.unit ? (
            <p className="text-fg-subtle mt-0.5 text-xs">{item.unit}</p>
          ) : null}
        </div>
        <QuantityStepper
          name={item.name}
          value={quantity}
          onChange={change}
          onStep={(delta) =>
            change(
              Math.max(
                0,
                Math.round((quantityRef.current + delta) * 1000) / 1000,
              ),
            )
          }
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Os produtos da rodada em preparação, no celular.
 *
 * A tabela do desktop (produto, quantidade, unidade de preço, situação, editar
 * e remover) não cabe em 390px, e editar a quantidade abria um formulário na
 * linha. Aqui é a linha da lista de compras: nome e unidade, o passo à direita
 * (no 1, o − vira a lixeira), salvando sozinho.
 *
 * `key` leva a quantidade do servidor, para a linha recomeçar do valor
 * confirmado quando a Central atualiza.
 */
export function MobileRoundItems({
  roundId,
  items,
}: {
  roundId: string;
  items: MobileRoundItem[];
}) {
  return (
    <ul className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs sm:hidden">
      {items.map((item) => (
        <ItemRow
          key={`${item.id}:${item.quantity}`}
          roundId={roundId}
          item={item}
        />
      ))}
    </ul>
  );
}
