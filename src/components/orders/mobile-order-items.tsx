"use client";

import { MessageSquareText, Plus, ScanBarcode, Search, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as React from "react";

import { ItemAnimado } from "@/components/motion/movimento";
import type { OrderableProduct } from "@/components/orders/order-item-rows";
import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import {
  formatQuantity,
  indexProducts,
  QuantityStepper,
  searchProducts,
} from "@/components/shopping-list/mobile-quick-add";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { barcodeMatches } from "@/features/products/barcodes";
import { cn } from "@/lib/utils";

/** A linha como o celular a enxerga: o resto do estado é de `OrderItemRows`. */
export type MobileOrderRow = {
  key: number;
  productId: string;
  name: string;
  purchaseUnit: string;
  pricingUnit: string;
  quantity: number;
  price: string;
  notes: string;
  fromShoppingList: boolean;
  /** Linha noutra forma de compra ("cx"): a busca soma só na padrão. */
  inOtherForm: boolean;
};

export type MobileOrderHandlers = {
  /**
   * Soma (ou tira) um do produto; sem linha, cria uma com 1. Com `rowKey`,
   * mexe naquela linha — a de outra forma de compra ("cx") não é a do produto.
   */
  onStep: (product: OrderableProduct, delta: 1 | -1, rowKey?: number) => void;
  /** Quantidade digitada; zero remove a linha, e sem linha cria uma. */
  onQuantity: (
    product: OrderableProduct,
    quantity: number,
    rowKey?: number,
  ) => void;
  onPrice: (key: number, price: string) => void;
  onNotes: (key: number, notes: string) => void;
};

function NotesDialog({
  row,
  open,
  onOpenChange,
  onSave,
}: {
  row: MobileOrderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (notes: string) => void;
}) {
  const [draft, setDraft] = React.useState(row.notes);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(row.notes);
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Observação do item</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {row.name}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter aqui enviaria o pedido inteiro, que está em volta.
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSave(draft.trim());
              onOpenChange(false);
            }}
            maxLength={200}
            autoFocus
            aria-label="Observação do item"
            placeholder="Marca, embalagem, entregar separado…"
            className="h-12 text-base"
          />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() => {
              onSave(draft.trim());
              onOpenChange(false);
            }}
          >
            Pronto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  row,
  product,
  handlers,
}: {
  row: MobileOrderRow;
  product: OrderableProduct;
  handlers: MobileOrderHandlers;
}) {
  const [notesOpen, setNotesOpen] = React.useState(false);
  const priceId = `pedido-preco-${row.key}`;

  return (
    <ItemAnimado className="border-border border-b last:border-b-0" conteudoClassName="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
            {row.name}
          </p>
          <p className="text-fg-subtle mt-0.5 truncate text-xs">
            {row.purchaseUnit || "unidade do cadastro"}
            {row.fromShoppingList ? " · da lista de compras" : ""}
          </p>
        </div>
        <QuantityStepper
          name={row.name}
          value={row.quantity}
          onChange={(next) => handlers.onQuantity(product, next, row.key)}
          onStep={(delta) => handlers.onStep(product, delta, row.key)}
        />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <label
          htmlFor={priceId}
          className={cn(
            "border-input bg-input-bg focus-within:border-ring focus-within:ring-ring/30 flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-3 focus-within:ring-3",
            !row.price.trim() && "border-warning/60",
          )}
        >
          <span className="text-fg-subtle text-sm">R$</span>
          <input
            id={priceId}
            inputMode="decimal"
            value={row.price}
            onChange={(event) => handlers.onPrice(row.key, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label={`Preço de ${row.name}${row.pricingUnit ? ` por ${row.pricingUnit}` : ""}`}
            placeholder="Preço"
            className="text-fg placeholder:text-fg-subtle h-full min-w-0 flex-1 bg-transparent text-base tabular-nums outline-none"
          />
          {row.pricingUnit ? (
            <span className="text-fg-subtle shrink-0 text-sm">
              /{row.pricingUnit}
            </span>
          ) : null}
        </label>
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          aria-label={
            row.notes ? `Observação: ${row.notes}` : "Adicionar observação"
          }
          className={cn(
            "active:bg-surface-muted grid size-11 shrink-0 place-items-center rounded-lg border",
            row.notes
              ? "border-primary/40 bg-primary-soft text-primary"
              : "border-border text-fg-subtle",
          )}
        >
          <MessageSquareText className="size-4" aria-hidden />
        </button>
      </div>
      {row.notes ? (
        <p className="text-fg-muted mt-1.5 truncate text-xs">{row.notes}</p>
      ) : null}

      <NotesDialog
        row={row}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        onSave={(notes) => handlers.onNotes(row.key, notes)}
      />
    </ItemAnimado>
  );
}

function ResultRow({
  product,
  quantity,
  onStep,
  onQuantity,
}: {
  product: OrderableProduct;
  quantity: number;
  onStep: (delta: 1 | -1) => void;
  onQuantity: (next: number) => void;
}) {
  if (quantity <= 0) {
    return (
      <li className="border-border border-b last:border-b-0">
        <button
          type="button"
          onClick={() => onStep(1)}
          className="active:bg-surface-muted flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="text-fg line-clamp-2 text-sm leading-snug font-medium">
              {product.name}
            </span>
            {product.purchaseUnit ? (
              <span className="text-fg-subtle block text-xs">
                {product.purchaseUnit}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden
            className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-full"
          >
            <Plus className="size-5" />
          </span>
          <span className="sr-only">Adicionar ao pedido</span>
        </button>
      </li>
    );
  }

  return (
    <li className="border-border animate-ds-in flex min-h-16 items-center gap-3 border-b px-4 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-fg line-clamp-2 text-sm leading-snug font-medium">
          {product.name}
        </p>
        <p className="text-primary text-xs">
          No pedido{product.purchaseUnit ? ` · ${product.purchaseUnit}` : ""}
        </p>
      </div>
      <QuantityStepper
        name={product.name}
        value={quantity}
        onChange={onQuantity}
        onStep={onStep}
      />
    </li>
  );
}

/**
 * Busca de produtos do pedido em tela cheia, com câmera contínua.
 *
 * O mesmo gesto da lista de compras: um toque põe 1 no pedido e o passo ajusta
 * dali. Nada vai ao servidor aqui — as linhas são do formulário e só saem com
 * "Criar pedido" (ou "Salvar rascunho"), então não há pausa nem desfazer.
 */
function AddSheet({
  products,
  loading,
  failed,
  onOpen,
  rows,
  handlers,
}: {
  products: OrderableProduct[];
  loading: boolean;
  failed: boolean;
  onOpen: () => void;
  rows: MobileOrderRow[];
  handlers: MobileOrderHandlers;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const index = React.useMemo(() => indexProducts(products), [products]);
  const quantityOf = React.useMemo(
    () =>
      new Map(
        rows
          .filter((row) => !row.inOtherForm)
          .map((row) => [row.productId, row]),
      ),
    [rows],
  );
  const results = searchProducts(index, query);

  function handleScan(code: string): BarcodeScanOutcome {
    const product = products.find((candidate) =>
      barcodeMatches(candidate.barcodes ?? [], code),
    );
    if (!product) {
      return {
        ok: false,
        message: loading
          ? "Os produtos ainda estão carregando. Tente de novo em instantes."
          : `O código ${code} não está vinculado a nenhum produto cadastrado.`,
      };
    }
    const next = (quantityOf.get(product.id)?.quantity ?? 0) + 1;
    handlers.onStep(product, 1);
    return {
      ok: true,
      label: `${product.name} · ${formatQuantity(next)}${product.purchaseUnit ? ` ${product.purchaseUnit}` : ""} no pedido`,
    };
  }

  function step(product: OrderableProduct, delta: 1 | -1) {
    handlers.onStep(product, delta);
    if (delta === 1) navigator.vibrate?.(30);
  }

  const camera = (
    <BarcodeCameraDialog
      continuous
      onDetected={handleScan}
      onOpenChange={(next) => {
        if (next) onOpen();
      }}
      triggerClassName="size-12 rounded-xl pointer-coarse:size-12"
    />
  );

  const emptyMessage = failed
    ? "Não foi possível carregar os produtos. Feche e abra de novo."
    : loading && products.length === 0
      ? "Carregando os produtos…"
      : `Nenhum produto com “${query.trim()}”. Confira a grafia ou tente parte do nome.`;

  return (
    <div className="flex gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            onOpen();
            setQuery("");
          }
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            className="border-input bg-input-bg text-fg-muted active:bg-surface-muted flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3.5 text-left text-base shadow-xs"
          >
            <Search className="text-fg-subtle size-4 shrink-0" aria-hidden />
            <span className="truncate">Buscar produto para o pedido</span>
          </button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Adicionar ao pedido</DialogTitle>
            <DialogDescription className="sr-only">
              Busque o produto pelo nome ou pelo código de barras e toque nele
              para colocá-lo no pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="border-border flex shrink-0 gap-2 border-b px-4 py-3">
            <div className="relative min-w-0 flex-1">
              <Search
                className="text-fg-subtle pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Enter não pode enviar o formulário do pedido, que está em
                  // volta: soma o primeiro e limpa, como o leitor físico espera.
                  event.preventDefault();
                  if (results[0]) {
                    step(results[0], 1);
                    setQuery("");
                  }
                }}
                role="searchbox"
                aria-label="Buscar produto"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                placeholder="Nome ou código de barras"
                className="border-input bg-input-bg text-fg placeholder:text-fg-subtle focus:border-ring focus:ring-ring/30 h-12 w-full rounded-xl border pr-11 pl-10 text-base outline-none focus:ring-3"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => setQuery("")}
                  className="text-fg-subtle active:text-fg absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            {camera}
          </div>

          <DialogBody className="p-0">
            {query.trim() ? (
              results.length > 0 ? (
                <ul aria-label="Produtos encontrados">
                  {results.map((product) => (
                    <ResultRow
                      key={product.id}
                      product={product}
                      quantity={quantityOf.get(product.id)?.quantity ?? 0}
                      onStep={(delta) => step(product, delta)}
                      onQuantity={(next) => handlers.onQuantity(product, next)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted px-4 py-10 text-center text-sm">
                  {emptyMessage}
                </p>
              )
            ) : rows.length > 0 ? (
              <section aria-label="Já no pedido">
                <h3 className="text-fg-muted px-4 pt-3 pb-1 text-xs font-medium">
                  No pedido ({rows.length})
                </h3>
                <ul>
                  {rows.map((row) => {
                    const product = {
                      id: row.productId,
                      name: row.name,
                      purchaseUnit: row.purchaseUnit,
                      pricingUnit: row.pricingUnit,
                    };
                    return (
                      <ResultRow
                        key={row.key}
                        product={product}
                        quantity={row.quantity}
                        onStep={(delta) => step(product, delta)}
                        onQuantity={(next) =>
                          handlers.onQuantity(product, next)
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            ) : (
              <div className="text-fg-muted flex flex-col items-center gap-3 px-8 py-12 text-center">
                <span className="bg-surface-muted text-fg-subtle grid size-12 place-items-center rounded-2xl">
                  <ScanBarcode className="size-6" aria-hidden />
                </span>
                <p className="text-sm">
                  Digite o nome do produto ou toque na câmera para bipar o
                  código. Cada toque coloca 1 no pedido.
                </p>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => setOpen(false)}
            >
              {rows.length > 0 ? `Concluir (${rows.length})` : "Fechar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {camera}
    </div>
  );
}

/**
 * Os itens do pedido no celular.
 *
 * No desktop cada item é um cartão com produto, quantidade, preço, observação
 * e lixeira — no celular, ~220px por item e um seletor de produto que some
 * debaixo do teclado. Aqui o produto entra pela folha de busca (ou pela
 * câmera), e cada item vira uma linha: nome e unidade, o passo de quantidade
 * (no 1, o − vira a lixeira), o preço logo abaixo e a observação atrás de um
 * toque. É a mesma lógica da lista de compras.
 *
 * Linhas sem produto (a linha em branco do desktop) não aparecem aqui: são
 * descartadas pelo servidor de qualquer jeito.
 */
export function MobileOrderItems({
  rows,
  products,
  catalog,
  handlers,
}: {
  rows: MobileOrderRow[];
  products: OrderableProduct[];
  catalog: { loading: boolean; failed: boolean; load: () => void };
  handlers: MobileOrderHandlers;
}) {
  const byId = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const missingPrice = rows.filter((row) => !row.price.trim()).length;

  return (
    <div className="flex flex-col gap-3 sm:hidden">
      <AddSheet
        products={products}
        loading={catalog.loading}
        failed={catalog.failed}
        onOpen={catalog.load}
        rows={rows}
        handlers={handlers}
      />

      {rows.length > 0 ? (
        <section aria-label="Itens do pedido">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
            <h3 className="text-fg text-sm font-semibold">
              {rows.length === 1 ? "1 item" : `${rows.length} itens`}
            </h3>
            {missingPrice > 0 ? (
              <p className="text-warning text-xs font-medium">
                {missingPrice === 1
                  ? "1 sem preço"
                  : `${missingPrice} sem preço`}
              </p>
            ) : null}
          </div>
          <ul className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
            <AnimatePresence initial={false}>
            {rows.map((row) => (
              <ItemRow
                key={row.key}
                row={row}
                product={
                  byId.get(row.productId) ?? {
                    id: row.productId,
                    name: row.name,
                    purchaseUnit: row.purchaseUnit,
                    pricingUnit: row.pricingUnit,
                  }
                }
                handlers={handlers}
              />
            ))}
            </AnimatePresence>
          </ul>
        </section>
      ) : (
        <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Nenhum item ainda. Busque o produto ou bipe o código.
        </p>
      )}
    </div>
  );
}
