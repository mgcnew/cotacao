"use client";

import { Barcode, Plus } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import {
  indexProducts,
  MobileQuickAdd,
  type PendingQuantity,
  searchProducts,
} from "@/components/shopping-list/mobile-quick-add";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avisar } from "@/components/ui/toaster";
import {
  addShoppingListItem,
  type ShoppingListState,
} from "@/features/shopping-list/actions";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { barcodeMatches } from "@/features/products/barcodes";
import { cn } from "@/lib/utils";

function findProductByBarcode(products: ShoppingProduct[], code: string) {
  return products.find((product) => barcodeMatches(product.barcodes, code));
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className="col-span-2 h-10 w-full gap-1.5 sm:col-span-1 sm:h-7 sm:w-auto"
    >
      <Plus className="size-3.5" aria-hidden />
      {pending ? "Adicionando…" : "Adicionar"}
    </Button>
  );
}

/**
 * No celular entra `MobileQuickAdd`; este formulário é do desktop e fica oculto
 * abaixo de `sm` (oculto também não recebe o `autoFocus`, que abria o teclado
 * assim que a tela carregava).
 */
export function ShoppingListQuickAdd({
  products,
  pending,
}: {
  products: ShoppingProduct[];
  pending: PendingQuantity[];
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<ShoppingProduct | null>(null);
  const [quantity, setQuantity] = React.useState("1");
  const [active, setActive] = React.useState(0);
  const formRef = React.useRef<HTMLFormElement>(null);
  const productRef = React.useRef<HTMLInputElement>(null);
  const quantityRef = React.useRef<HTMLInputElement>(null);
  const submitAction = React.useCallback(
    async (previous: ShoppingListState, formData: FormData) => {
      const result = await addShoppingListItem(previous, formData);
      if (!result.error) {
        const added = products.find(
          (product) => product.id === formData.get("productId"),
        );
        if (added) {
          avisar(
            `${added.name} adicionado · ${String(formData.get("quantity")).trim()}${
              added.purchaseUnit ? ` ${added.purchaseUnit}` : ""
            }`,
          );
        }
        setQuery("");
        setSelected(null);
        // Quem adiciona em sequência não quer herdar a quantidade do item
        // anterior: 12 de um produto virando 12 do próximo é erro de verdade.
        setQuantity("1");
        window.setTimeout(() => productRef.current?.focus(), 0);
      }
      return result;
    },
    [products],
  );
  const [state, action] = useActionState<ShoppingListState, FormData>(
    submitAction,
    { error: null },
  );

  const index = React.useMemo(() => indexProducts(products), [products]);
  const inList = React.useMemo(
    () => new Map(pending.map((item) => [item.productId, item.quantity])),
    [pending],
  );
  const suggestions = React.useMemo(
    () => (query.trim() ? searchProducts(index, query).slice(0, 8) : []),
    [index, query],
  );
  const listOpen = suggestions.length > 0 && !selected;
  const activeIndex = Math.min(active, Math.max(suggestions.length - 1, 0));
  const selectedInList = selected ? inList.get(selected.id) : undefined;

  /** Escolhe o produto e leva o foco à quantidade, já selecionada para digitar. */
  function choose(product: ShoppingProduct) {
    setSelected(product);
    setQuery(product.name);
    window.setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }, 0);
  }

  function handleCameraCode(code: string): BarcodeScanOutcome {
    const product = findProductByBarcode(products, code);
    if (!product) {
      return {
        ok: false,
        message: `O código ${code} não está vinculado a nenhum produto cadastrado.`,
      };
    }
    setSelected(product);
    setQuery(product.name);
    window.setTimeout(() => formRef.current?.requestSubmit(), 0);
    return { ok: true, label: product.name };
  }

  return (
    <>
      <MobileQuickAdd
        key={pending.map((item) => `${item.productId}:${item.quantity}`).join("|")}
        products={products}
        pending={pending}
      />
      <form
        ref={formRef}
        action={action}
        className="border-border bg-surface relative hidden flex-col gap-3 rounded-xl border p-4 sm:flex"
      >
        <input type="hidden" name="productId" value={selected?.id ?? ""} />
        <div className="grid grid-cols-[minmax(6.5rem,0.38fr)_minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(10rem,0.7fr)_auto] sm:items-end">
          <div className="relative col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
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
                  ref={productRef}
                  id="shopping-product"
                  autoFocus
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={listOpen}
                  aria-controls="shopping-product-list"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    listOpen
                      ? `shopping-product-option-${activeIndex}`
                      : undefined
                  }
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    setSelected(null);
                    setActive(0);
                    const normalized = value
                      .trim()
                      .replace(/\s+/g, "")
                      .toUpperCase();
                    const exact = findProductByBarcode(products, normalized);
                    if (exact) setSelected(exact);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      if (!listOpen) return;
                      event.preventDefault();
                      const step = event.key === "ArrowDown" ? 1 : -1;
                      setActive(
                        (activeIndex + step + suggestions.length) %
                          suggestions.length,
                      );
                      return;
                    }
                    if (event.key === "Escape") {
                      if (!query) return;
                      event.preventDefault();
                      setQuery("");
                      setSelected(null);
                      return;
                    }
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    // Código de barras completo (leitor físico) entra direto,
                    // com a quantidade que está no campo. Busca por nome só
                    // escolhe: a quantidade ainda é decisão de quem digita.
                    if (selected) {
                      formRef.current?.requestSubmit();
                      return;
                    }
                    if (listOpen) choose(suggestions[activeIndex]);
                  }}
                  placeholder="Digite o nome ou bipe o código"
                  className="h-10 pl-8 sm:h-8"
                />
              </div>
              <BarcodeCameraDialog
                onDetected={handleCameraCode}
                triggerClassName="size-10 sm:size-7"
              />
            </div>
            {listOpen ? (
              <ul
                id="shopping-product-list"
                role="listbox"
                aria-label="Produtos encontrados"
                className="border-border bg-surface absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
              >
                {suggestions.map((product, position) => {
                  const already = inList.get(product.id);
                  return (
                    <li
                      key={product.id}
                      id={`shopping-product-option-${position}`}
                      role="option"
                      aria-selected={position === activeIndex}
                      // `mousedown` e não `click`: o campo perderia o foco antes
                      // do clique e a lista fecharia por baixo do ponteiro.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(product);
                      }}
                      onMouseEnter={() => setActive(position)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm",
                        position === activeIndex && "bg-surface-muted",
                      )}
                    >
                      <span className="min-w-0 truncate">{product.name}</span>
                      <span className="text-fg-subtle flex shrink-0 items-center gap-2 text-xs">
                        {already ? (
                          <span className="bg-primary-soft text-primary rounded-sm px-1.5">
                            na lista · {String(already).replace(".", ",")}
                          </span>
                        ) : null}
                        {product.purchaseUnit}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor="shopping-quantity"
              className="text-fg text-sm font-medium"
            >
              Quantidade
            </label>
            <Input
              ref={quantityRef}
              id="shopping-quantity"
              name="quantity"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onFocus={(event) => event.target.select()}
              inputMode="decimal"
              className="h-10 sm:h-8"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
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
              className="h-10 sm:h-8"
            />
          </div>
          <Submit />
        </div>
        <ErrorLine error={state.error} />
        <p className="text-fg-subtle text-xs">
          {selected && selectedInList !== undefined ? (
            <>
              <span className="text-primary font-medium">
                {selected.name} já está na lista com{" "}
                {String(selectedInList).replace(".", ",")}
                {selected.purchaseUnit ? ` ${selected.purchaseUnit}` : ""}.
              </span>{" "}
              O que você adicionar soma a isso.
            </>
          ) : (
            "↑ ↓ escolhem e Enter seleciona; Enter de novo adiciona. Um código de barras completo, pelo leitor ou pela câmera, entra direto."
          )}
        </p>
      </form>
    </>
  );
}
