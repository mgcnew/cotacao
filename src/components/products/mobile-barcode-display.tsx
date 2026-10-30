"use client";

import JsBarcode from "jsbarcode";
import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  Maximize2,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  barcodeMatches,
  findMatchingBarcode,
  normalizeBarcode,
} from "@/features/products/barcodes";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { normalizeListSearch } from "@/lib/list-pagination";
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
  const [query, setQuery] = React.useState("");
  const [entryError, setEntryError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const current =
    recent.find((item) => labelKey(item) === currentKey) ?? recent[0] ?? null;
  const position = current
    ? recent.findIndex((item) => labelKey(item) === labelKey(current))
    : -1;

  const availableLabels = React.useMemo(
    () =>
      products.flatMap((product) =>
        product.barcodes
          .map(normalizeBarcode)
          .filter((code) => code && /^[\x20-\x7e]+$/.test(code))
          .map((code) => ({ id: product.id, name: product.name, code })),
      ),
    [products],
  );
  const needle = normalizeListSearch(query.trim());
  const exactCode = query
    ? availableLabels.find(
        (item) => normalizeBarcode(item.code) === normalizeBarcode(query),
      )
    : null;
  const suggestions = needle
    ? availableLabels
        .filter((item) =>
          normalizeListSearch(`${item.name} ${item.code}`).includes(needle),
        )
        .slice(0, 8)
    : [];

  function addLabel(scanned: ScannedProduct, refocus = false) {
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
    setQuery("");
    setEntryError(null);
    if (refocus) window.setTimeout(() => inputRef.current?.focus(), 0);
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
    if (!/^[\x20-\x7e]+$/.test(registeredCode)) {
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

  function addFromInput() {
    const selected = exactCode ?? suggestions[0];
    if (!selected) {
      setEntryError("Nenhum produto cadastrado foi encontrado.");
      return;
    }
    addLabel(selected, true);
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
            <div className="relative min-w-0 flex-1">
              <Search
                className="text-fg-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setEntryError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addFromInput();
                }}
                autoComplete="off"
                inputMode="search"
                enterKeyHint="search"
                placeholder="Produto ou código de barras"
                aria-label="Buscar produto ou informar código de barras"
                className="pl-9"
              />
              {suggestions.length > 0 ? (
                <div className="border-border bg-surface absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border p-1 shadow-lg">
                  {suggestions.map((item) => (
                    <button
                      key={labelKey(item)}
                      type="button"
                      onClick={() => addLabel(item, true)}
                      className="hover:bg-surface-muted active:bg-surface-muted flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <code className="text-fg-muted shrink-0 text-xs">
                        {item.code}
                      </code>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {/* Contínuo: aqui a pessoa monta uma pilha de etiquetas de uma vez,
                e reabrir a câmera a cada item custava mais que a leitura. */}
            <BarcodeCameraDialog
              onDetected={handleDetected}
              continuous
              successVibrationMs={35}
              triggerLabel="Câmera"
            />
          </div>
          {entryError ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {entryError}
            </p>
          ) : null}
          <p className="text-fg-subtle mt-2 text-xs">
            Com leitor físico, basta bipar: o Enter adiciona e deixa o campo
            pronto para o próximo.
          </p>
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
                        <span className="block truncate text-sm font-medium">
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
