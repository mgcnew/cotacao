"use client";

import { Minus, Plus, ScanBarcode, Search, Trash2, X } from "lucide-react";
import * as React from "react";

import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import { avisar } from "@/components/ui/toaster";
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
import { Button } from "@/components/ui/button";
import {
  refreshShoppingList,
  setShoppingListItemQuantity,
} from "@/features/shopping-list/actions";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { barcodeMatches, normalizeBarcode } from "@/features/products/barcodes";
import { normalizeListSearch } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

export type PendingQuantity = {
  productId: string;
  /** Forma de compra da linha ("cx"); nula ou ausente na padrão. */
  purchaseFormId?: string | null;
  quantity: number;
};

/**
 * Uma linha da busca: o produto na forma padrão, ou numa das outras formas
 * ("cx (12 un)"). Cada forma é uma linha da lista ou da rodada, com o seu
 * próprio + e −; a chave junta produto e forma.
 */
type Entry = ShoppingProduct & {
  key: string;
  productId: string;
  formId: string | null;
};

function entryKey(productId: string, formId: string | null | undefined) {
  return formId ? `${productId}:${formId}` : productId;
}

/**
 * As formas vêm logo depois do produto, e sem códigos de barras: a busca por
 * nome mostra as duas, e o bipe cai na padrão, que é a que o código identifica.
 */
function quickAddEntries(products: ShoppingProduct[]): Entry[] {
  return products.flatMap((product) => [
    { ...product, key: product.id, productId: product.id, formId: null },
    ...product.forms.map((form) => ({
      ...product,
      key: entryKey(product.id, form.id),
      productId: product.id,
      formId: form.id,
      purchaseUnit: form.label,
      barcodes: [],
    })),
  ]);
}

/** O que muda quando a mesma folha serve a outro destino (a rodada de compras). */
export type QuickAddTexts = {
  trigger: string;
  title: string;
  description: string;
  /** Rótulo do produto que já está no destino: "Na lista". */
  added: string;
  addAction: string;
  hint: string;
  scanned: string;
  updated: (count: number) => string;
};

const SHOPPING_LIST_TEXTS: QuickAddTexts = {
  trigger: "Buscar produto para adicionar",
  title: "Adicionar à lista",
  description:
    "Busque o produto pelo nome ou pelo código de barras e toque nele para colocá-lo na lista.",
  added: "Na lista",
  addAction: "Adicionar à lista",
  hint: "Digite o nome do produto ou toque na câmera para bipar o código. Cada toque coloca 1 na lista.",
  scanned: "na lista",
  updated: (count) =>
    count === 1
      ? "Lista atualizada: 1 produto"
      : `Lista atualizada: ${count} produtos`,
};

const BAR_CLASS =
  "bg-background sticky -top-6 z-20 -mx-4 -mt-5 flex gap-2 px-4 pt-6 pb-3 sm:hidden";

const MAX_RESULTS = 30;
/** Pausa antes de mandar a quantidade: três toques em + viram uma chamada só. */
const SAVE_DELAY_MS = 350;

export function formatQuantity(value: number) {
  return String(value).replace(".", ",");
}

/** Mesma leitura do formulário do desktop: "1.200,5" e "3,5" valem. */
export function parseQuantity(text: string) {
  const value = Number(text.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 99_999) return null;
  return Math.round(value * 1000) / 1000;
}

type Searchable = { name: string; barcodes?: string[] };

export type IndexedProduct<P extends Searchable = ShoppingProduct> = {
  product: P;
  text: string;
  codes: string[];
};

export function indexProducts<P extends Searchable>(
  products: P[],
): IndexedProduct<P>[] {
  return products.map((product) => ({
    product,
    text: normalizeListSearch(product.name),
    codes: (product.barcodes ?? []).map(normalizeBarcode),
  }));
}

/**
 * Busca por todas as palavras, em qualquer ordem ("suco laranja" acha "Suco po
 * laranja tang"), e por código de barras digitado ou bipado por leitor físico.
 * Quem começa pelo que foi digitado vem antes de quem só contém.
 */
export function searchProducts<P extends Searchable>(
  index: IndexedProduct<P>[],
  query: string,
) {
  const tokens = normalizeListSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const code = normalizeBarcode(query);
  const ranked: { product: P; rank: number }[] = [];
  for (const entry of index) {
    let rank: number | null = null;
    if (code.length >= 3 && entry.codes.some((own) => own.includes(code))) {
      rank = 0;
    } else if (tokens.every((token) => entry.text.includes(token))) {
      rank = entry.text.startsWith(tokens[0])
        ? 1
        : entry.text.includes(` ${tokens[0]}`)
          ? 2
          : 3;
    }
    if (rank !== null) ranked.push({ product: entry.product, rank });
  }
  // `sort` é estável: dentro do mesmo grau fica a ordem alfabética do catálogo.
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_RESULTS)
    .map((item) => item.product);
}

export function QuantityStepper({
  name,
  value,
  onChange,
  onStep,
}: {
  name: string;
  value: number;
  /** Valor digitado no campo. */
  onChange: (next: number) => void;
  /** Os botões mandam o passo, não o resultado: dois toques antes de a tela
   * redesenhar somam os dois, em vez de repetir o mesmo valor. */
  onStep: (delta: 1 | -1) => void;
}) {
  // Enquanto se digita, o texto é do campo; o valor só volta a valer ao sair.
  const [draft, setDraft] = React.useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = parseQuantity(draft);
    setDraft(null);
    if (parsed !== null && parsed !== value) onChange(parsed);
  }

  const removes = value <= 1;
  const stepButton =
    "text-fg-muted active:bg-surface-muted grid size-11 shrink-0 place-items-center transition-colors";

  return (
    <div
      role="group"
      aria-label={`Quantidade de ${name}`}
      className="border-border bg-surface flex shrink-0 items-center rounded-lg border"
    >
      <button
        type="button"
        aria-label={removes ? `Remover ${name} da lista` : `Diminuir ${name}`}
        onClick={() => onStep(-1)}
        className={cn(
          stepButton,
          "rounded-l-lg",
          removes && "text-destructive",
        )}
      >
        {removes ? (
          <Trash2 className="size-4" aria-hidden />
        ) : (
          <Minus className="size-4" aria-hidden />
        )}
      </button>
      <input
        inputMode="decimal"
        aria-label={`Quantidade de ${name}`}
        value={draft ?? formatQuantity(value)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="text-fg h-11 w-12 min-w-0 bg-transparent text-center text-base font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label={`Aumentar ${name}`}
        onClick={() => onStep(1)}
        className={cn(stepButton, "rounded-r-lg")}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function ProductRow({
  product,
  quantity,
  onChange,
  onStep,
  texts,
}: {
  product: ShoppingProduct;
  quantity: number;
  onChange: (next: number) => void;
  onStep: (delta: 1 | -1) => void;
  texts: QuickAddTexts;
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
          <span className="sr-only">{texts.addAction}</span>
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
          {texts.added}
          {product.purchaseUnit ? ` · ${product.purchaseUnit}` : ""}
        </p>
      </div>
      <QuantityStepper
        name={product.name}
        value={quantity}
        onChange={onChange}
        onStep={onStep}
      />
    </li>
  );
}

/**
 * Adicionar à lista de compras no celular.
 *
 * O formulário do desktop (nome, quantidade, observação, botão) obriga quatro
 * passos e esconde o resultado abaixo do teclado. Aqui a busca ocupa a tela, um
 * toque no produto já o põe na lista com 1, e a quantidade se ajusta no próprio
 * item. A câmera segue aberta entre as leituras.
 *
 * A quantidade mora aqui, na tela, e vai ao servidor depois de uma pausa
 * (`setShoppingListItemQuantity`, valor absoluto). A página só é atualizada uma
 * vez, ao fechar a folha e a câmera — refazê-la a cada toque travaria quem está
 * adicionando em sequência.
 *
 * `save`, `refresh` e `texts` existem para a montagem da rodada usar a mesma
 * folha; sem eles, é a lista de compras.
 */
export function MobileQuickAdd({
  products,
  pending,
  save = setShoppingListItemQuantity,
  refresh = refreshShoppingList,
  texts = SHOPPING_LIST_TEXTS,
  barClassName = BAR_CLASS,
}: {
  products: ShoppingProduct[];
  pending: PendingQuantity[];
  save?: (
    productId: string,
    quantity: number,
    purchaseFormId: string | null,
  ) => Promise<{ error: string | null }>;
  refresh?: () => Promise<void>;
  texts?: QuickAddTexts;
  barClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [quantities, setQuantities] = React.useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        pending.map((item) => [
          entryKey(item.productId, item.purchaseFormId),
          item.quantity,
        ]),
      ),
  );
  // Linhas (produto e forma) mexidas desde que a folha abriu, a mais recente
  // primeiro.
  const [touched, setTouched] = React.useState<string[]>([]);

  // O que vale na hora (para somar sobre o valor de agora, não o do último
  // render) e o que o servidor já confirmou (para onde voltar se ele recusar).
  const quantitiesRef = React.useRef(quantities);
  const confirmedRef = React.useRef<Record<string, number>>({ ...quantities });
  const timersRef = React.useRef(new Map<string, number>());
  const inflightRef = React.useRef(0);
  const dirtyRef = React.useRef(false);
  const overlayRef = React.useRef({ sheet: false, camera: false });

  const entries = React.useMemo(() => quickAddEntries(products), [products]);
  const index = React.useMemo(() => indexProducts(entries), [entries]);
  const byKey = React.useMemo(
    () => new Map(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  const settle = React.useCallback(() => {
    const { sheet, camera } = overlayRef.current;
    if (!dirtyRef.current || sheet || camera) return;
    if (timersRef.current.size > 0 || inflightRef.current > 0) return;
    dirtyRef.current = false;
    void refresh();
  }, [refresh]);

  const write = React.useCallback((key: string, next: number) => {
    quantitiesRef.current = { ...quantitiesRef.current, [key]: next };
    setQuantities(quantitiesRef.current);
  }, []);

  const push = React.useCallback(
    async (key: string) => {
      timersRef.current.delete(key);
      const wanted = quantitiesRef.current[key] ?? 0;
      // A chave é "produto" ou "produto:forma" — ids sem dois-pontos.
      const [productId, formId = null] = key.split(":");
      inflightRef.current += 1;
      let failure: string | null = null;
      try {
        const result = await save(productId, wanted, formId);
        if (result.error) failure = result.error;
        else confirmedRef.current[key] = wanted;
      } catch {
        failure = "Sem conexão com o servidor. A quantidade não foi salva.";
      }
      inflightRef.current -= 1;
      if (failure) {
        // Um toque mais novo já está a caminho e vale mais que o desfazer.
        if (!timersRef.current.has(key)) {
          write(key, confirmedRef.current[key] ?? 0);
        }
        setError(failure);
      }
      settle();
    },
    [save, settle, write],
  );

  const change = React.useCallback(
    (entry: Entry, next: number) => {
      write(entry.key, next);
      setTouched((current) => [
        entry.key,
        ...current.filter((key) => key !== entry.key),
      ]);
      setError(null);
      dirtyRef.current = true;
      const timers = timersRef.current;
      const waiting = timers.get(entry.key);
      if (waiting !== undefined) window.clearTimeout(waiting);
      timers.set(
        entry.key,
        window.setTimeout(() => void push(entry.key), SAVE_DELAY_MS),
      );
    },
    [push, write],
  );

  // Sair da tela no meio da pausa não pode perder o último toque.
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const [key, timer] of timers) {
        window.clearTimeout(timer);
        void push(key);
      }
    };
  }, [push]);

  function handleSheetChange(next: boolean) {
    overlayRef.current.sheet = next;
    setOpen(next);
    if (next) {
      setQuery("");
      setError(null);
      setTouched([]);
      return;
    }
    const count = touched.filter(
      (key) => (quantitiesRef.current[key] ?? 0) > 0,
    ).length;
    if (count > 0) {
      avisar(texts.updated(count));
    }
    settle();
  }

  function handleCameraChange(next: boolean) {
    overlayRef.current.camera = next;
    if (!next) settle();
  }

  function handleScan(code: string): BarcodeScanOutcome {
    const found = products.find((candidate) =>
      barcodeMatches(candidate.barcodes, code),
    );
    // O código é do produto: soma na forma padrão.
    const product = found ? byKey.get(found.id) : undefined;
    if (!product) {
      return {
        ok: false,
        message: `O código ${code} não está vinculado a nenhum produto cadastrado.`,
      };
    }
    const next = (quantitiesRef.current[product.key] ?? 0) + 1;
    change(product, next);
    return {
      ok: true,
      label: `${product.name} · ${formatQuantity(next)}${product.purchaseUnit ? ` ${product.purchaseUnit}` : ""} ${texts.scanned}`,
    };
  }

  function step(product: Entry, delta: 1 | -1) {
    const next = Math.max(
      0,
      Math.round(((quantitiesRef.current[product.key] ?? 0) + delta) * 1000) /
        1000,
    );
    change(product, next);
    if (delta === 1) navigator.vibrate?.(30);
  }

  const results = searchProducts(index, query);
  const added = touched.flatMap((key) => {
    const product = byKey.get(key);
    return product && (quantities[key] ?? 0) > 0 ? [product] : [];
  });

  // A busca fica: "tang" costuma render mais de um sabor, e limpar a cada toque
  // obrigaria a digitar de novo. O item já aparece ali com os botões de
  // quantidade; quem quer outro produto limpa no X.
  function addFromResult(product: Entry) {
    step(product, 1);
  }

  const camera = (
    <BarcodeCameraDialog
      continuous
      onDetected={handleScan}
      onOpenChange={handleCameraChange}
      triggerClassName="size-12 rounded-xl pointer-coarse:size-12"
    />
  );

  // A `main` tem 24px de respiro em cima, e o `sticky` respeita esse espaço:
  // sem o `-top-6`, a barra gruda 24px abaixo do cabeçalho e a lista passa por
  // cima dela. O `pt-6` e o `-mt-5` devolvem a posição de repouso.
  return (
    <div className={barClassName}>
      <Dialog open={open} onOpenChange={handleSheetChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="border-input bg-input-bg text-fg-muted active:bg-surface-muted flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3.5 text-left text-base shadow-xs"
          >
            <Search className="text-fg-subtle size-4 shrink-0" aria-hidden />
            <span className="truncate">{texts.trigger}</span>
          </button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{texts.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {texts.description}
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
                  event.preventDefault();
                  // Enter é o atalho de quem digita ou usa leitor físico: soma e
                  // limpa, pronto para o próximo código.
                  if (results[0]) {
                    addFromResult(results[0]);
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

          {error ? (
            <p
              role="alert"
              className="bg-destructive-soft text-destructive shrink-0 px-4 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <DialogBody className="p-0">
            {query.trim() ? (
              results.length > 0 ? (
                <ul aria-label="Produtos encontrados">
                  {results.map((product) => (
                    <ProductRow
                      key={product.key}
                      product={product}
                      quantity={quantities[product.key] ?? 0}
                      texts={texts}
                      onChange={(next) => change(product, next)}
                      onStep={(delta) =>
                        (quantitiesRef.current[product.key] ?? 0) === 0
                          ? addFromResult(product)
                          : step(product, delta)
                      }
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted px-4 py-10 text-center text-sm">
                  Nenhum produto com “{query.trim()}”. Confira a grafia ou tente
                  parte do nome.
                </p>
              )
            ) : added.length > 0 ? (
              <section aria-label="Adicionados agora">
                <h3 className="text-fg-muted px-4 pt-3 pb-1 text-xs font-medium">
                  Adicionados agora ({added.length})
                </h3>
                <ul>
                  {added.map((product) => (
                    <ProductRow
                      key={product.key}
                      product={product}
                      quantity={quantities[product.key] ?? 0}
                      texts={texts}
                      onChange={(next) => change(product, next)}
                      onStep={(delta) => step(product, delta)}
                    />
                  ))}
                </ul>
              </section>
            ) : (
              <div className="text-fg-muted flex flex-col items-center gap-3 px-8 py-12 text-center">
                <span className="bg-surface-muted text-fg-subtle grid size-12 place-items-center rounded-2xl">
                  <ScanBarcode className="size-6" aria-hidden />
                </span>
                <p className="text-sm">{texts.hint}</p>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => handleSheetChange(false)}
            >
              {added.length > 0 ? `Concluir (${added.length})` : "Fechar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {camera}
    </div>
  );
}
