"use client";

import { ListChecks, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export { ErrorLine } from "@/components/layout/form-feedback";

export const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

export type OrderableProduct = {
  id: string;
  name: string;
  purchaseUnit: string;
  pricingUnit: string;
};

/** Linha já existente no pedido, ou linha em branco esperando ser preenchida. */
export type ItemSeed = {
  /** Id do `order_revision_item`, quando a linha já existe no banco. */
  itemId?: string;
  /** Alocação que originou o item; viaja junto para não se perder na revisão. */
  allocationId?: string | null;
  /** Item da lista que originou a linha; consumido só quando o pedido nascer. */
  shoppingItemId?: string | null;
  productId: string;
  productName?: string;
  quantity: string;
  price: string;
  notes: string;
};

export function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export const NUMERO = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

/** Número do banco no formato que a pessoa digita e reconhece. */
export function paraCampo(valor: number, casas = 2): string {
  return valor.toFixed(casas).replace(".", ",");
}

type Row = ItemSeed & { key: number };

/**
 * Os itens de um pedido, em linhas que se acrescentam e se removem.
 *
 * Os campos são não controlados de propósito: a lista de linhas é estado, o
 * conteúdo delas não. Assim, remover uma linha não faz as outras perderem o
 * que já tinha sido digitado — o React mantém os nós pela `key`, e o valor
 * digitado continua onde estava.
 *
 * A linha de um item que já existe no banco não deixa trocar o produto: trocar
 * seria outro item, não uma correção. Para isso, remove-se e acrescenta-se.
 */
export function OrderItemRows({
  products,
  seeds,
  shoppingItems = [],
  idPrefix = "",
}: {
  products: OrderableProduct[];
  seeds: ItemSeed[];
  shoppingItems?: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    purchaseUnit: string;
    notes: string;
    isActive: boolean;
  }[];
  idPrefix?: string;
}) {
  const proximaChave = React.useRef(seeds.length);
  const [rows, setRows] = React.useState<Row[]>(() =>
    seeds.map((seed, index) => ({ ...seed, key: index })),
  );
  const [selectedShopping, setSelectedShopping] = React.useState<string[]>([]);
  const productOptions = React.useMemo(
    () =>
      products.map((product) => ({
        id: product.id,
        name: product.name,
        description: `${product.purchaseUnit} · preço por ${product.pricingUnit}`,
      })),
    [products],
  );

  const unidadesDe = (row: Row) => products.find((p) => p.id === row.productId);

  return (
    <div className="flex flex-col gap-3">
      {shoppingItems.length > 0 ? (
        <details className="border-border rounded-lg border">
          <summary className="text-fg flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <ListChecks className="text-primary size-4" aria-hidden />
            Puxar da lista de compras
            <span className="text-fg-subtle font-normal">
              ({shoppingItems.length})
            </span>
          </summary>
          <div className="border-border flex flex-col gap-3 border-t p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {shoppingItems.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedShopping.includes(item.id)}
                    disabled={
                      !item.isActive ||
                      rows.some((row) => row.shoppingItemId === item.id)
                    }
                    onChange={(event) =>
                      setSelectedShopping((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="text-fg block font-medium">
                      {item.productName}
                    </span>
                    <span className="text-fg-muted block text-xs">
                      {item.quantity} {item.purchaseUnit}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedShopping.length === 0}
                onClick={() => {
                  const additions = shoppingItems
                    .filter((item) => selectedShopping.includes(item.id))
                    .map((item) => ({
                      key: proximaChave.current++,
                      shoppingItemId: item.id,
                      productId: item.productId,
                      productName: item.productName,
                      quantity: item.quantity,
                      price: "",
                      notes: item.notes,
                    }));
                  setRows((current) => [
                    ...current.filter(
                      (row) =>
                        row.productId || row.quantity || row.price || row.notes,
                    ),
                    ...additions,
                  ]);
                  setSelectedShopping([]);
                }}
              >
                Adicionar selecionados
              </Button>
            </div>
          </div>
        </details>
      ) : null}
      {rows.map((row) => {
        const unidades = unidadesDe(row);
        const productFieldId = `${idPrefix}produto-${row.key}`;
        const quantityFieldId = `${idPrefix}qtd-${row.key}`;
        const priceFieldId = `${idPrefix}preco-${row.key}`;
        return (
          <div
            key={row.key}
            className="border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            {row.itemId ? (
              <input type="hidden" name="itemId" value={row.itemId} />
            ) : (
              // O array de itens precisa ficar alinhado com o de produtos: uma
              // linha nova mandaria um campo a menos e desalinharia o resto.
              <input type="hidden" name="itemId" value="" />
            )}
            <input
              type="hidden"
              name="allocationId"
              value={row.allocationId ?? ""}
            />
            <input
              type="hidden"
              name="shoppingItemId"
              value={row.shoppingItemId ?? ""}
            />

            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={productFieldId}
                  className="text-fg-muted text-xs"
                >
                  Produto
                </label>
                {row.itemId ? (
                  <>
                    <input type="hidden" name="productId" value={row.productId} />
                    <p
                      id={productFieldId}
                      className="text-fg flex h-8 items-center text-sm"
                    >
                      {row.productName}
                    </p>
                  </>
                ) : (
                  <SearchableSelect
                    id={productFieldId}
                    name="productId"
                    required
                    value={row.productId}
                    onValueChange={(productId) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, productId }
                            : r,
                        ),
                      )
                    }
                    options={productOptions}
                    placeholder="Digite o nome do produto…"
                    emptyMessage="Nenhum produto encontrado."
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={quantityFieldId} className="text-fg-muted text-xs">
                  Quantidade{unidades ? ` (${unidades.purchaseUnit})` : ""}
                </label>
                <Input
                  id={quantityFieldId}
                  name="quantity"
                  required
                  inputMode="decimal"
                  defaultValue={row.quantity}
                  className="h-8"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={priceFieldId}
                  className="text-fg-muted text-xs"
                >
                  Preço{unidades ? ` (por ${unidades.pricingUnit})` : ""}
                </label>
                <Input
                  id={priceFieldId}
                  name="price"
                  required
                  inputMode="decimal"
                  defaultValue={row.price}
                  className="h-8"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                name="itemNotes"
                maxLength={200}
                defaultValue={row.notes}
                placeholder="Observação do item (opcional)"
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-fg-subtle shrink-0"
                aria-label="Remover item"
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.key !== row.key))
                }
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}

      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                key: proximaChave.current++,
                shoppingItemId: "",
                productId: "",
                quantity: "",
                price: "",
                notes: "",
              },
            ])
          }
        >
          <Plus className="size-3.5" aria-hidden /> Adicionar item
        </Button>
      </div>
    </div>
  );
}
