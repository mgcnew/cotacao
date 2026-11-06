"use client";

import JsBarcode from "jsbarcode";
import {
  Barcode,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import {
  indexProducts,
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
import {
  barcodeMatches,
  findMatchingBarcode,
  normalizeBarcode,
} from "@/features/products/barcodes";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { cn } from "@/lib/utils";

type ScannedProduct = {
  id: string;
  name: string;
  code: string;
};

const LABEL_STORAGE_VERSION = 1;
const LABEL_STORAGE_EVENT = "cotapro:stored-labels-changed";

function labelKey(item: Pick<ScannedProduct, "id" | "code">) {
  return `${item.id}:${item.code}`;
}

function storageKey(companyId: string) {
  return `cotapro:labels:${LABEL_STORAGE_VERSION}:${companyId}`;
}

function storedSnapshot(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function parseStoredLabels(raw: string, products: ShoppingProduct[]) {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as {
      version?: number;
      items?: { id?: unknown; code?: unknown }[];
    };
    if (
      stored.version !== LABEL_STORAGE_VERSION ||
      !Array.isArray(stored.items)
    ) {
      return [];
    }

    const result: ScannedProduct[] = [];
    const seen = new Set<string>();
    for (const candidate of stored.items) {
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.code !== "string"
      ) {
        continue;
      }
      const product = products.find((item) => item.id === candidate.id);
      const code = product
        ? findMatchingBarcode(product.barcodes, candidate.code)
        : null;
      if (!product || !code) continue;
      const key = labelKey({ id: product.id, code });
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: product.id, name: product.name, code });
    }
    return result;
  } catch {
    return [];
  }
}

function useStoredLabels(companyId: string, products: ShoppingProduct[]) {
  const key = storageKey(companyId);
  const subscribe = React.useCallback(
    (notify: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === key) notify();
      };
      const handleLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) notify();
      };
      window.addEventListener("storage", handleStorage);
      window.addEventListener(LABEL_STORAGE_EVENT, handleLocalChange);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(LABEL_STORAGE_EVENT, handleLocalChange);
      };
    },
    [key],
  );
  const getSnapshot = React.useCallback(() => storedSnapshot(key), [key]);
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, () => "");
  const items = React.useMemo(
    () => parseStoredLabels(raw, products),
    [products, raw],
  );

  const save = React.useCallback(
    (next: ScannedProduct[]) => {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: LABEL_STORAGE_VERSION,
            items: next.map(({ id, code }) => ({ id, code })),
          }),
        );
        window.dispatchEvent(
          new CustomEvent<string>(LABEL_STORAGE_EVENT, { detail: key }),
        );
        return true;
      } catch {
        return false;
      }
    },
    [key],
  );

  return { items, save };
}

/**
 * O desenho do código. `compact` cabe no topo da tela junto da lista; `large`
 * é o da tela cheia, que o leitor externo lê de mais longe.
 */
function GeneratedBarcode({
  code,
  size,
}: {
  code: string;
  size: "compact" | "large";
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useLayoutEffect(() => {
    if (!svgRef.current) return;
    const barWidth = code.length > 24 ? 1 : code.length > 16 ? 1.4 : 2;
    JsBarcode(svgRef.current, code, {
      format: "CODE128",
      background: "#ffffff",
      lineColor: "#000000",
      width: barWidth,
      height: size === "large" ? 170 : 90,
      margin: size === "large" ? 16 : 8,
      displayValue: true,
      font: "monospace",
      fontSize: size === "large" ? 24 : 18,
      textMargin: 6,
    });
  }, [code, size]);

  return (
    <svg
      ref={svgRef}
      className={cn(
        "mx-auto block h-auto w-full max-w-full",
        size === "large" ? "max-h-[70dvh]" : "max-h-32",
      )}
      role="img"
      aria-label={`Código de barras ${code}`}
    />
  );
}

/**
 * Tela cheia por sobreposição, e não pela API de tela cheia: o iPhone não a
 * oferece para elementos comuns, justamente onde mais se usa. Mantém a tela
 * acesa enquanto está aberta, para o brilho não cair no meio da leitura, e tem
 * as setas aqui dentro — passar para a próxima etiqueta sem fechar.
 */
function BarcodeOverlay({
  open,
  onOpenChange,
  current,
  position,
  total,
  onStep,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: ScannedProduct;
  position: number;
  total: number;
  onStep: (direction: -1 | 1) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    void navigator.wakeLock
      ?.request("screen")
      .then((sentinel) => {
        if (cancelled) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-black outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Código de barras de {current.name}
          </DialogPrimitive.Title>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{current.name}</p>
              <p className="font-mono text-sm text-neutral-600">{current.code}</p>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar tela cheia"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-900 active:bg-neutral-200"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 items-center">
            <GeneratedBarcode code={current.code} size="large" />
          </div>
          {total > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onStep(-1)}
                disabled={position === 0}
                aria-label="Etiqueta anterior"
                className="grid size-14 place-items-center rounded-full bg-neutral-100 text-neutral-900 active:bg-neutral-200 disabled:opacity-30"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <span className="text-sm text-neutral-600 tabular-nums">
                {position + 1} de {total}
              </span>
              <button
                type="button"
                onClick={() => onStep(1)}
                disabled={position === total - 1}
                aria-label="Próxima etiqueta"
                className="grid size-14 place-items-center rounded-full bg-neutral-100 text-neutral-900 active:bg-neutral-200 disabled:opacity-30"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Só o que o CODE 128 consegue desenhar vira etiqueta. */
const PRINTABLE_CODE = /^[\x20-\x7e]+$/;

/**
 * Folha de busca: abre ao tocar e fica aberta enquanto se monta a pilha.
 *
 * O campo antigo fechava a lista a cada toque e escondia o nome por trás de
 * `truncate`, então cada etiqueta custava buscar, tocar e buscar de novo, e
 * nomes parecidos (sabor, tamanho) não se distinguiam. Aqui o toque marca e
 * mantém a busca, o nome quebra em duas linhas e tocar de novo desfaz.
 */
function LabelSearchSheet({
  products,
  recent,
  onAdd,
  onRemove,
  error,
  onClearError,
}: {
  products: ShoppingProduct[];
  recent: ScannedProduct[];
  onAdd: (label: ScannedProduct) => boolean;
  onRemove: (label: ScannedProduct) => void;
  error: string | null;
  onClearError: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [addedKeys, setAddedKeys] = React.useState<string[]>([]);

  const index = React.useMemo(
    () =>
      indexProducts(
        products
          .map((product) => ({
            ...product,
            barcodes: product.barcodes
              .map(normalizeBarcode)
              .filter((code) => code && PRINTABLE_CODE.test(code)),
          }))
          .filter((product) => product.barcodes.length > 0),
      ),
    [products],
  );
  const results = React.useMemo(
    () =>
      query.trim()
        ? searchProducts(index, query).flatMap((product) =>
            product.barcodes.map((code) => ({
              id: product.id,
              name: product.name,
              code,
            })),
          )
        : [],
    [index, query],
  );
  const recentKeys = new Set(recent.map(labelKey));
  const addedNow = addedKeys
    .map((key) => recent.find((item) => labelKey(item) === key))
    .filter((item): item is ScannedProduct => item !== undefined);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setAddedKeys([]);
      onClearError();
    }
  }

  function toggle(label: ScannedProduct) {
    const key = labelKey(label);
    if (recentKeys.has(key)) {
      onRemove(label);
      setAddedKeys((keys) => keys.filter((item) => item !== key));
      return;
    }
    if (onAdd(label)) {
      setAddedKeys((keys) => [key, ...keys.filter((item) => item !== key)]);
    }
  }

  function rows(list: ScannedProduct[]) {
    return (
      <ul>
        {list.map((item) => {
          const marked = recentKeys.has(labelKey(item));
          return (
            <li
              key={labelKey(item)}
              className="border-border border-b last:border-b-0"
            >
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={marked}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left",
                  marked ? "bg-primary-soft" : "active:bg-surface-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-fg line-clamp-2 text-sm leading-snug font-medium">
                    {item.name}
                  </span>
                  <code className="text-fg-muted block truncate text-xs">
                    {item.code}
                  </code>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    marked
                      ? "bg-primary-solid text-primary-solid-fg"
                      : "bg-primary-soft text-primary",
                  )}
                >
                  {marked ? (
                    <Check className="size-5" />
                  ) : (
                    <Plus className="size-5" />
                  )}
                </span>
                <span className="sr-only">
                  {marked ? "Tirar das etiquetas" : "Adicionar às etiquetas"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-input bg-input-bg text-fg-muted active:bg-surface-muted flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3.5 text-left text-base shadow-xs"
        >
          <Search className="text-fg-subtle size-4 shrink-0" aria-hidden />
          <span className="truncate">Buscar produto</span>
        </button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Adicionar etiquetas</DialogTitle>
          <DialogDescription className="sr-only">
            Busque pelo nome ou pelo código e toque nos produtos para guardar
            as etiquetas neste aparelho.
          </DialogDescription>
        </DialogHeader>

        <div className="border-border shrink-0 border-b px-4 py-3">
          <div className="relative">
            <Search
              className="text-fg-subtle pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                onClearError();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                // Atalho de quem digita ou usa leitor físico: adiciona o
                // primeiro resultado e limpa, pronto para o próximo.
                const first = results[0];
                if (!first) return;
                if (!recentKeys.has(labelKey(first))) toggle(first);
                setQuery("");
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
              <>
                <p className="text-fg-subtle px-4 pt-3 pb-1 text-xs">
                  Toque para adicionar. Toque de novo para tirar.
                </p>
                {rows(results)}
              </>
            ) : (
              <p className="text-fg-muted px-4 py-10 text-center text-sm">
                Nenhum produto com código de barras para “{query.trim()}”.
                Confira a grafia ou tente parte do nome.
              </p>
            )
          ) : addedNow.length > 0 ? (
            <section aria-label="Adicionadas agora">
              <h3 className="text-fg-muted px-4 pt-3 pb-1 text-xs font-medium">
                Adicionadas agora ({addedNow.length})
              </h3>
              {rows(addedNow)}
            </section>
          ) : (
            <div className="text-fg-muted flex flex-col items-center gap-3 px-8 py-12 text-center">
              <span className="bg-surface-muted text-fg-subtle grid size-12 place-items-center rounded-2xl">
                <ScanBarcode className="size-6" aria-hidden />
              </span>
              <p className="text-sm">
                Digite parte do nome ou o código. A busca fica aberta: toque em
                quantos produtos quiser e conclua no fim.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() => handleOpenChange(false)}
          >
            {addedNow.length > 0 ? `Concluir (${addedNow.length})` : "Fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MobileBarcodeDisplay({
  companyId,
  products,
}: {
  companyId: string;
  products: ShoppingProduct[];
}) {
  const { items: recent, save: saveRecent } = useStoredLabels(
    companyId,
    products,
  );
  const [currentKey, setCurrentKey] = React.useState<string | null>(null);
  const [entryError, setEntryError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const current =
    recent.find((item) => labelKey(item) === currentKey) ?? recent[0] ?? null;
  const position = current
    ? recent.findIndex((item) => labelKey(item) === labelKey(current))
    : -1;

  function addLabel(scanned: ScannedProduct) {
    const next = [
      scanned,
      ...recent.filter((item) => labelKey(item) !== labelKey(scanned)),
    ];
    if (!saveRecent(next)) {
      setEntryError(
        "O navegador bloqueou o armazenamento. Verifique as permissões do site.",
      );
      return false;
    }
    setCurrentKey(labelKey(scanned));
    setEntryError(null);
    return true;
  }

  function handleDetected(rawCode: string): BarcodeScanOutcome {
    const code = normalizeBarcode(rawCode);
    const product = products.find((item) =>
      barcodeMatches(item.barcodes, code),
    );
    if (!product) {
      return {
        ok: false,
        message: `O código ${code} não pertence a nenhum produto cadastrado.`,
      };
    }

    const registeredCode = findMatchingBarcode(product.barcodes, code);
    if (!registeredCode) {
      return {
        ok: false,
        message: `O código ${code} não pertence a nenhum produto cadastrado.`,
      };
    }
    if (!PRINTABLE_CODE.test(registeredCode)) {
      return {
        ok: false,
        message:
          "Este código possui caracteres que não podem ser exibidos em CODE 128.",
      };
    }
    const scanned = {
      id: product.id,
      name: product.name,
      code: registeredCode,
    };
    return addLabel(scanned)
      ? { ok: true, label: product.name }
      : {
          ok: false,
          message: "Não foi possível guardar esta etiqueta no aparelho.",
        };
  }

  function step(direction: -1 | 1) {
    const target = recent[position + direction];
    if (target) setCurrentKey(labelKey(target));
  }

  function removeCode(item: ScannedProduct) {
    const next = recent.filter(
      (recentItem) => labelKey(recentItem) !== labelKey(item),
    );
    saveRecent(next);
    if (current && labelKey(current) === labelKey(item)) {
      if (next.length === 0) setExpanded(false);
      setCurrentKey(next[0] ? labelKey(next[0]) : null);
    }
  }

  function clearCodes() {
    setExpanded(false);
    saveRecent([]);
    setCurrentKey(null);
  }

  return (
    /* O código fica preso no topo e só o que está embaixo rola. Antes a página
       inteira rolava: para trocar de etiqueta era preciso descer até a lista,
       escolher e subir de novo para ver o desenho. Agora escolher e ver
       acontecem na mesma tela. */
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        aria-label="Código em exibição"
        className="border-border bg-surface shrink-0 border-b px-3 pt-3 pb-2.5"
      >
        {current ? (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-fg truncate text-base leading-tight font-semibold">
                  {current.name}
                </h2>
                <p className="text-fg-muted font-mono text-xs">{current.code}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeCode(current)}
                aria-label="Apagar este código"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Ampliar código em tela cheia"
              className="focus-visible:ring-ring/50 mt-2 block w-full overflow-hidden rounded-xl bg-white p-1 outline-none focus-visible:ring-2"
            >
              <GeneratedBarcode code={current.code} size="compact" />
            </button>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => step(-1)}
                disabled={position <= 0}
                aria-label="Etiqueta anterior"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className="text-fg-muted flex-1 text-center text-xs tabular-nums">
                {position + 1} de {recent.length}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => step(1)}
                disabled={position >= recent.length - 1}
                aria-label="Próxima etiqueta"
              >
                <ChevronRight aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpanded(true)}
                className="ml-1 pointer-coarse:h-11"
              >
                <Maximize2 aria-hidden /> Ampliar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <span className="bg-surface-muted text-fg-subtle grid size-10 shrink-0 place-items-center rounded-xl">
              <Barcode className="size-5" aria-hidden />
            </span>
            <p className="text-fg-muted text-sm">
              Leia a embalagem ou busque o produto: o código aparece aqui, fixo
              no topo, para mostrar ao leitor.
            </p>
          </div>
        )}
      </section>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
        <section>
          <div className="flex items-start gap-2">
            <LabelSearchSheet
              products={products}
              recent={recent}
              onAdd={addLabel}
              onRemove={removeCode}
              error={entryError}
              onClearError={() => setEntryError(null)}
            />
            {/* Contínuo: aqui a pessoa monta uma pilha de etiquetas de uma vez,
                e reabrir a câmera a cada item custava mais que a leitura. */}
            <BarcodeCameraDialog
              onDetected={handleDetected}
              continuous
              successVibrationMs={35}
              triggerLabel="Câmera"
              triggerClassName="h-12 rounded-xl pointer-coarse:h-12"
            />
          </div>
          {entryError ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {entryError}
            </p>
          ) : null}
        </section>

        {recent.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-fg text-sm font-semibold">
                  Etiquetas salvas ({recent.length})
                </h2>
                <p className="text-fg-subtle text-xs">
                  Ficam neste aparelho. Toque para mostrar no topo.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearCodes}
              >
                <Trash2 aria-hidden /> Limpar
              </Button>
            </div>
            <ul className="space-y-1.5">
              {recent.map((item) => {
                const showing = current !== null && labelKey(current) === labelKey(item);
                return (
                  <li
                    key={labelKey(item)}
                    className={cn(
                      "border-border flex items-center gap-1 rounded-xl border p-1",
                      showing ? "border-primary-line bg-primary-soft" : "bg-surface",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCurrentKey(labelKey(item))}
                      aria-pressed={showing}
                      className="active:bg-surface-muted flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm leading-snug font-medium">
                          {item.name}
                        </span>
                        <code className="text-fg-muted text-xs">{item.code}</code>
                      </span>
                      {showing ? (
                        <span className="text-primary shrink-0 text-xs font-medium">
                          No topo
                        </span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeCode(item)}
                      aria-label={`Apagar código de ${item.name}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {current ? (
        <BarcodeOverlay
          open={expanded}
          onOpenChange={setExpanded}
          current={current}
          position={position}
          total={recent.length}
          onStep={step}
        />
      ) : null}
    </div>
  );
}
