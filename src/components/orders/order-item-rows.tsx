"use client";

import { History, ListChecks, Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  SupplierPurchaseSuggestion,
  SupplierPurchaseTemplate,
} from "@/features/orders/queries";

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

const PURCHASE_DATE = new Intl.DateTimeFormat("pt-BR");
const PURCHASE_PRICE = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function numeroDoCampo(value: string) {
  return Number(value.trim().replace(/\./g, "").replace(",", "."));
}

function somaNoCampo(left: string, right: string) {
  const sum = numeroDoCampo(left) + numeroDoCampo(right);
  if (!Number.isFinite(sum)) return right || left;
  return sum
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

function mergeSuggestionRows(current: Row[], additions: Row[]) {
  const next = current.filter(
    (row) => row.productId || row.quantity || row.price || row.notes,
  );
  for (const addition of additions) {
    const existingIndex = next.findIndex(
      (row) => row.productId === addition.productId,
    );
    if (existingIndex < 0) {
      next.push(addition);
      continue;
    }
    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      quantity: somaNoCampo(existing.quantity, addition.quantity),
      price: existing.price || addition.price,
      notes: existing.notes || addition.notes,
    };
  }
  return next;
}

type SuggestionDraft = {
  selected: boolean;
  quantity: string;
  price: string;
};

function suggestionDraft(item: SupplierPurchaseSuggestion): SuggestionDraft {
  return {
    selected: false,
    quantity: item.quantity,
    price: item.lastPrice === null ? "" : paraCampo(item.lastPrice),
  };
}

function SupplierTemplateSuggestions({
  templates,
  addedProductIds,
  onAdd,
}: {
  templates: SupplierPurchaseTemplate[];
  addedProductIds: Set<string>;
  onAdd: (
    items: { suggestion: SupplierPurchaseSuggestion; draft: SuggestionDraft }[],
  ) => void;
}) {
  const allItems = React.useMemo(
    () => templates.flatMap((template) => template.items),
    [templates],
  );
  const [drafts, setDrafts] = React.useState<Record<string, SuggestionDraft>>(
    () =>
      Object.fromEntries(
        allItems.map((item) => [item.id, suggestionDraft(item)]),
      ),
  );
  const selected = allItems.flatMap((item) => {
    const draft = drafts[item.id];
    return draft?.selected && !addedProductIds.has(item.productId)
      ? [{ suggestion: item, draft }]
      : [];
  });
  const available = allItems.filter(
    (item) => !addedProductIds.has(item.productId),
  );

  function updateDraft(id: string, patch: Partial<SuggestionDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  return (
    <details
      open
      className="border-primary/25 bg-primary-soft/30 rounded-xl border"
    >
      <summary className="text-fg flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <Sparkles className="text-primary size-4" aria-hidden />
        Produtos sugeridos deste fornecedor
        <span className="text-fg-subtle font-normal">({allItems.length})</span>
      </summary>
      <div className="border-primary/20 flex flex-col gap-4 border-t p-3">
        <p className="text-fg-muted text-xs">
          Quantidades vêm do modelo. O preço é apenas uma referência da última
          compra efetiva e poderá ser corrigido pelo fornecedor.
        </p>

        {templates.map((template) => (
          <section key={template.id} className="flex flex-col gap-2">
            <p className="text-fg text-xs font-semibold">{template.label}</p>
            <div className="grid gap-2 lg:grid-cols-2">
              {template.items.map((item) => {
                const draft = drafts[item.id] ?? suggestionDraft(item);
                const alreadyAdded = addedProductIds.has(item.productId);
                const quantityId = `suggestion-quantity-${item.id}`;
                const priceId = `suggestion-price-${item.id}`;
                return (
                  <article
                    key={item.id}
                    className="border-border bg-surface relative grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8rem] sm:items-end"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${item.productName}`}
                      checked={draft.selected && !alreadyAdded}
                      disabled={alreadyAdded}
                      onChange={(event) =>
                        updateDraft(item.id, {
                          selected: event.target.checked,
                        })
                      }
                      className="absolute top-3 right-3 size-4 accent-primary sm:static sm:mb-2 sm:self-end"
                    />
                    <div className="min-w-0 pr-7 sm:self-center sm:pr-0">
                      <p className="text-fg truncate text-sm font-medium">
                        {item.productName}
                      </p>
                      {alreadyAdded ? (
                        <span className="text-success text-xs font-medium">
                          Já está no pedido
                        </span>
                      ) : item.lastPrice !== null && item.lastPurchasedAt ? (
                        <span className="text-fg-subtle flex flex-wrap items-center gap-1 text-xs">
                          <History className="size-3" aria-hidden />
                          Último pago em {PURCHASE_DATE.format(
                            new Date(item.lastPurchasedAt),
                          )}
                          {item.lastPriceIsStale ? (
                            <span className="text-warning font-medium">
                              · histórico antigo
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-fg-subtle text-xs">
                          Sem preço no histórico
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={quantityId}
                        className="text-fg-muted text-xs"
                      >
                        Quantidade
                        {item.purchaseUnit ? ` (${item.purchaseUnit})` : ""}
                      </label>
                      <Input
                        id={quantityId}
                        inputMode="decimal"
                        value={draft.quantity}
                        disabled={alreadyAdded}
                        onChange={(event) =>
                          updateDraft(item.id, { quantity: event.target.value })
                        }
                        className="h-8"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={priceId}
                        className="text-fg-muted text-xs"
                      >
                        Último preço
                        {item.pricingUnit ? `/${item.pricingUnit}` : ""}
                      </label>
                      <Input
                        id={priceId}
                        inputMode="decimal"
                        value={draft.price}
                        disabled={alreadyAdded}
                        placeholder={
                          item.lastPrice === null
                            ? "Informar"
                            : PURCHASE_PRICE.format(item.lastPrice)
                        }
                        onChange={(event) =>
                          updateDraft(item.id, { price: event.target.value })
                        }
                        className="h-8"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              onAdd(selected);
              setDrafts((current) =>
                Object.fromEntries(
                  Object.entries(current).map(([id, draft]) => [
                    id,
                    { ...draft, selected: false },
                  ]),
                ),
              );
            }}
          >
            Adicionar selecionados
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={available.length === 0}
            onClick={() =>
              setDrafts((current) => ({
                ...current,
                ...Object.fromEntries(
                  available.map((item) => [
                    item.id,
                    { ...current[item.id], selected: true },
                  ]),
                ),
              }))
            }
          >
            Selecionar todos
          </Button>
        </div>
      </div>
    </details>
  );
}

/**
 * Os itens de um pedido, em linhas que se acrescentam e se removem.
 *
 * As linhas e seus valores ficam no mesmo estado. Isso permite somar a
 * quantidade sugerida quando o produto já existe, sem criar duplicidade nem
 * apagar o que a pessoa acabou de editar.
 *
 * A linha de um item que já existe no banco não deixa trocar o produto: trocar
 * seria outro item, não uma correção. Para isso, remove-se e acrescenta-se.
 */
export function OrderItemRows({
  products,
  seeds,
  shoppingItems = [],
  supplierTemplates = [],
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
  supplierTemplates?: SupplierPurchaseTemplate[];
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
  const addedProductIds = new Set(
    rows.flatMap((row) => (row.productId ? [row.productId] : [])),
  );

  return (
    <div className="flex flex-col gap-3">
      {supplierTemplates.length > 0 ? (
        <SupplierTemplateSuggestions
          key={supplierTemplates.map((template) => template.id).join(":")}
          templates={supplierTemplates}
          addedProductIds={addedProductIds}
          onAdd={(selected) => {
            const additions = selected.map(({ suggestion, draft }) => ({
              key: proximaChave.current++,
              shoppingItemId: "",
              productId: suggestion.productId,
              productName: suggestion.productName,
              quantity: draft.quantity,
              price: draft.price,
              notes: suggestion.notes,
            }));
            setRows((current) => mergeSuggestionRows(current, additions));
          }}
        />
      ) : null}
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
                      rows.some(
                        (row) =>
                          row.shoppingItemId === item.id ||
                          row.productId === item.productId,
                      )
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
                    options={productOptions.filter(
                      (option) =>
                        option.id === row.productId ||
                        !rows.some(
                          (other) =>
                            other.key !== row.key &&
                            other.productId === option.id,
                        ),
                    )}
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
                  value={row.quantity}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.key === row.key
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
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
                  value={row.price}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.key === row.key
                          ? { ...item, price: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className="h-8"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                name="itemNotes"
                maxLength={200}
                value={row.notes}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, notes: event.target.value }
                        : item,
                    ),
                  )
                }
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
