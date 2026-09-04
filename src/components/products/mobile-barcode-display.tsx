"use client";

import JsBarcode from "jsbarcode";
import {
  Barcode,
  Maximize2,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import * as React from "react";

import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  barcodeMatches,
  findMatchingBarcode,
  normalizeBarcode,
} from "@/features/products/barcodes";
import type { ShoppingProduct } from "@/features/shopping-list/queries";
import { normalizeListSearch } from "@/lib/list-pagination";

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

function GeneratedBarcode({ code }: { code: string }) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useLayoutEffect(() => {
    if (!svgRef.current) return;
    const barWidth = code.length > 24 ? 1 : code.length > 16 ? 1.4 : 2;
    JsBarcode(svgRef.current, code, {
      format: "CODE128",
      background: "#ffffff",
      lineColor: "#000000",
      width: barWidth,
      height: 150,
      margin: 16,
      displayValue: true,
      font: "monospace",
      fontSize: 22,
      textMargin: 8,
    });
  }, [code]);

  return (
    <div className="w-full overflow-hidden rounded-xl bg-white p-2">
      <svg
        ref={svgRef}
        className="mx-auto block h-auto max-h-56 w-full max-w-full"
        role="img"
        aria-label={`Código de barras ${code}`}
      />
    </div>
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
  const [fullscreenError, setFullscreenError] =
    React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const displayRef = React.useRef<HTMLDivElement>(null);
  const current =
    recent.find((item) => labelKey(item) === currentKey) ?? recent[0] ?? null;

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
    setFullscreenError(null);
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

  async function openFullscreen() {
    if (!displayRef.current?.requestFullscreen) {
      setFullscreenError(
        "Este navegador não oferece o modo de tela cheia. O código continua pronto para leitura.",
      );
      return;
    }
    try {
      await displayRef.current.requestFullscreen();
    } catch {
      setFullscreenError("Não foi possível abrir em tela cheia.");
    }
  }

  function removeCode(item: ScannedProduct) {
    const next = recent.filter(
      (recentItem) => labelKey(recentItem) !== labelKey(item),
    );
    saveRecent(next);
    if (current && labelKey(current) === labelKey(item)) {
      if (document.fullscreenElement) void document.exitFullscreen();
      setCurrentKey(next[0] ? labelKey(next[0]) : null);
    }
  }

  function clearCodes() {
    if (document.fullscreenElement) void document.exitFullscreen();
    saveRecent([]);
    setCurrentKey(null);
    setFullscreenError(null);
  }

  return (
    <div className="space-y-4">
      <section className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <ScanBarcode className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-fg font-semibold">Adicione uma etiqueta</h2>
            <p className="text-fg-muted mt-1 text-sm">
              Busque pelo produto, bipe com um leitor físico ou use a câmera.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="text-fg-subtle pointer-events-none absolute top-2 left-2.5 size-4"
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
              placeholder="Produto ou código de barras"
              aria-label="Buscar produto ou informar código de barras"
              className="pl-8"
            />
            {suggestions.length > 0 ? (
              <div className="border-border bg-surface absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border p-1 shadow-lg">
                {suggestions.map((item) => (
                  <button
                    key={labelKey(item)}
                    type="button"
                    onClick={() => addLabel(item, true)}
                    className="hover:bg-surface-muted flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left"
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
            triggerLabel="Câmera"
          />
        </div>
        {entryError ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {entryError}
          </p>
        ) : null}
        <p className="text-fg-subtle mt-2 text-xs">
          No leitor físico, basta bipar: o Enter adiciona e deixa o campo pronto
          para o próximo código.
        </p>
      </section>

      {current ? (
        <section
          ref={displayRef}
          className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 shadow-sm [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-white [&:fullscreen]:p-4"
        >
          <div className="flex items-start justify-between gap-3 [&:fullscreen]:text-black">
            <div className="min-w-0">
              <Badge variant="outline">CODE 128</Badge>
              <h2 className="mt-2 truncate text-lg font-semibold">
                {current.name}
              </h2>
              <p className="text-fg-muted mt-0.5 font-mono text-sm [&:fullscreen]:text-neutral-700">
                {current.code}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={openFullscreen}
                aria-label="Ampliar código em tela cheia"
              >
                <Maximize2 aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeCode(current)}
                aria-label="Apagar este código"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </div>
          <GeneratedBarcode code={current.code} />
          <p className="text-fg-subtle text-center text-xs [&:fullscreen]:text-neutral-600">
            Aumente o brilho da tela e aponte o leitor externo para o código
            inteiro.
          </p>
          {fullscreenError ? (
            <p role="alert" className="text-destructive text-sm">
              {fullscreenError}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="border-border bg-surface-sunken rounded-2xl border border-dashed px-5 py-10 text-center">
          <Barcode className="text-fg-subtle mx-auto size-9" aria-hidden />
          <p className="text-fg-muted mt-3 text-sm">
            O código para leitura aparecerá aqui.
          </p>
        </section>
      )}

      {recent.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-fg text-sm font-semibold">
                Etiquetas salvas ({recent.length})
              </h2>
              <p className="text-fg-subtle text-xs">
                Permanecem neste aparelho mesmo ao sair da página.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearCodes}
            >
              <Trash2 aria-hidden /> Limpar todas
            </Button>
          </div>
          <div className="space-y-2">
            {recent.map((item) => (
              <div
                key={labelKey(item)}
                className="border-border bg-surface flex w-full items-center gap-2 rounded-xl border p-1.5"
              >
                <button
                  type="button"
                  onClick={() => setCurrentKey(labelKey(item))}
                  aria-pressed={labelKey(current) === labelKey(item)}
                  className="hover:bg-surface-muted aria-pressed:bg-primary-soft flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <code className="text-fg-muted shrink-0 text-xs">
                    {item.code}
                  </code>
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
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
