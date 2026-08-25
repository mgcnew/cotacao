"use client";

import { Barcode, Plus } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { BarcodeCameraDialog } from "@/components/shopping-list/barcode-camera-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addShoppingListItem,
  type ShoppingListState,
} from "@/features/shopping-list/actions";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { barcodeMatches } from "@/features/products/barcodes";
import { normalizeListSearch } from "@/lib/list-pagination";

function findProductByBarcode(products: ShoppingProduct[], code: string) {
  return products.find((product) => barcodeMatches(product.barcodes, code));
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
      <Plus className="size-3.5" aria-hidden />
      {pending ? "Adicionando…" : "Adicionar"}
    </Button>
  );
}

export function ShoppingListQuickAdd({
  products,
}: {
  products: ShoppingProduct[];
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<ShoppingProduct | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitAction = React.useCallback(
    async (previous: ShoppingListState, formData: FormData) => {
      const result = await addShoppingListItem(previous, formData);
      if (!result.error) {
        setQuery("");
        setSelected(null);
        window.setTimeout(
          () =>
            formRef.current
              ?.querySelector<HTMLInputElement>("#shopping-product")
              ?.focus(),
          0,
        );
      }
      return result;
    },
    [],
  );
  const [state, action] = useActionState<ShoppingListState, FormData>(
    submitAction,
    { error: null },
  );

  const needle = normalizeListSearch(query);
  const suggestions = query
    ? products
        .filter((product) =>
          normalizeListSearch(
            `${product.name} ${product.barcodes.join(" ")}`,
          ).includes(needle),
        )
        .slice(0, 6)
    : [];

  function choose(product: ShoppingProduct) {
    setSelected(product);
    setQuery(product.name);
  }

  function handleCameraCode(code: string) {
    const product = findProductByBarcode(products, code);
    if (!product) {
      return `O código ${code} não está vinculado a nenhum produto cadastrado.`;
    }
    choose(product);
    window.setTimeout(() => formRef.current?.requestSubmit(), 0);
    return null;
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="border-border bg-surface relative flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="productId" value={selected?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(10rem,0.7fr)_auto] sm:items-end">
        <div className="relative flex flex-col gap-1.5">
          <label
            htmlFor="shopping-product"
            className="text-fg text-sm font-medium"
          >
            Produto
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Barcode
                className="text-fg-subtle pointer-events-none absolute top-2 left-2.5 size-4"
                aria-hidden
              />
              <Input
                id="shopping-product"
                autoFocus
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  setSelected(null);
                  const normalized = value
                    .trim()
                    .replace(/\s+/g, "")
                    .toUpperCase();
                  const exact = findProductByBarcode(products, normalized);
                  if (exact) setSelected(exact);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const product = selected ?? suggestions[0];
                  if (!product) return;
                  choose(product);
                  window.setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
                placeholder="Digite o nome ou bipe o código"
                className="pl-8"
              />
            </div>
            <BarcodeCameraDialog onDetected={handleCameraCode} />
          </div>
          {suggestions.length > 0 && !selected ? (
            <div className="border-border bg-surface absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-lg">
              {suggestions.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => choose(product)}
                  className="hover:bg-surface-muted flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                >
                  <span>{product.name}</span>
                  <span className="text-fg-subtle text-xs">
                    {product.purchaseUnit}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="shopping-quantity"
            className="text-fg text-sm font-medium"
          >
            Quantidade
          </label>
          <Input
            id="shopping-quantity"
            name="quantity"
            required
            defaultValue="1"
            inputMode="decimal"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="shopping-notes"
            className="text-fg text-sm font-medium"
          >
            Observação{" "}
            <span className="text-fg-subtle font-normal">(opcional)</span>
          </label>
          <Input
            id="shopping-notes"
            name="notes"
            maxLength={300}
            placeholder="Estoque crítico, para sexta…"
          />
        </div>
        <Submit />
      </div>
      <ErrorLine error={state.error} />
      <p className="text-fg-subtle text-xs">
        Use o botão da câmera no celular ou bipe com um leitor físico. Ao
        reconhecer o código, o produto entra automaticamente.
      </p>
    </form>
  );
}
