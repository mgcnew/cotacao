"use client";

import JsBarcode from "jsbarcode";
import { Barcode, Maximize2, ScanBarcode } from "lucide-react";
import * as React from "react";

import { BarcodeCameraDialog } from "@/components/shopping-list/barcode-camera-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { barcodeMatches, findMatchingBarcode, normalizeBarcode } from "@/features/products/barcodes";
import type { ShoppingProduct } from "@/features/shopping-list/queries";

type ScannedProduct = {
  id: string;
  name: string;
  code: string;
};

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

export function MobileBarcodeDisplay({ products }: { products: ShoppingProduct[] }) {
  const [current, setCurrent] = React.useState<ScannedProduct | null>(null);
  const [recent, setRecent] = React.useState<ScannedProduct[]>([]);
  const [fullscreenError, setFullscreenError] = React.useState<string | null>(null);
  const displayRef = React.useRef<HTMLDivElement>(null);

  function handleDetected(rawCode: string) {
    const code = normalizeBarcode(rawCode);
    const product = products.find((item) => barcodeMatches(item.barcodes, code));
    if (!product) return `O código ${code} não pertence a nenhum produto cadastrado.`;

    const registeredCode = findMatchingBarcode(product.barcodes, code);
    if (!registeredCode) return `O código ${code} não pertence a nenhum produto cadastrado.`;
    if (!/^[\x20-\x7E]+$/.test(registeredCode)) return "Este código possui caracteres que não podem ser exibidos em CODE 128.";
    const scanned = { id: product.id, name: product.name, code: registeredCode };
    setCurrent(scanned);
    setRecent((items) => [
      scanned,
      ...items.filter((item) => !(item.id === scanned.id && item.code === scanned.code)),
    ].slice(0, 8));
    setFullscreenError(null);
    return null;
  }

  async function openFullscreen() {
    if (!displayRef.current?.requestFullscreen) {
      setFullscreenError("Este navegador não oferece o modo de tela cheia. O código continua pronto para leitura.");
      return;
    }
    try {
      await displayRef.current.requestFullscreen();
    } catch {
      setFullscreenError("Não foi possível abrir em tela cheia.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <ScanBarcode className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-fg font-semibold">Escaneie a embalagem</h2>
            <p className="text-fg-muted mt-1 text-sm">
              O produto será identificado e o mesmo número aparecerá em um código grande para o leitor externo.
            </p>
          </div>
        </div>
        <BarcodeCameraDialog
          onDetected={handleDetected}
          triggerLabel={current ? "Ler próximo produto" : "Abrir câmera"}
          triggerClassName="mt-4 w-full"
        />
      </section>

      {current ? (
        <section
          ref={displayRef}
          className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 shadow-sm [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-white [&:fullscreen]:p-4"
        >
          <div className="flex items-start justify-between gap-3 [&:fullscreen]:text-black">
            <div className="min-w-0">
              <Badge variant="outline">CODE 128</Badge>
              <h2 className="mt-2 truncate text-lg font-semibold">{current.name}</h2>
              <p className="text-fg-muted mt-0.5 font-mono text-sm [&:fullscreen]:text-neutral-700">{current.code}</p>
            </div>
            <Button type="button" size="icon-sm" variant="outline" onClick={openFullscreen} aria-label="Ampliar código em tela cheia">
              <Maximize2 aria-hidden />
            </Button>
          </div>
          <GeneratedBarcode code={current.code} />
          <p className="text-fg-subtle text-center text-xs [&:fullscreen]:text-neutral-600">
            Aumente o brilho da tela e aponte o leitor externo para o código inteiro.
          </p>
          {fullscreenError ? <p role="alert" className="text-danger text-sm">{fullscreenError}</p> : null}
        </section>
      ) : (
        <section className="border-border bg-surface-sunken rounded-2xl border border-dashed px-5 py-10 text-center">
          <Barcode className="text-fg-subtle mx-auto size-9" aria-hidden />
          <p className="text-fg-muted mt-3 text-sm">O código para leitura aparecerá aqui.</p>
        </section>
      )}

      {recent.length > 1 ? (
        <section>
          <h2 className="text-fg mb-2 text-sm font-semibold">Lidos nesta sessão</h2>
          <div className="space-y-2">
            {recent.map((item) => (
              <button
                key={`${item.id}-${item.code}`}
                type="button"
                onClick={() => setCurrent(item)}
                className="border-border bg-surface hover:bg-surface-muted flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left"
              >
                <span className="min-w-0 truncate text-sm font-medium">{item.name}</span>
                <code className="text-fg-muted shrink-0 text-xs">{item.code}</code>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
