"use client";

import { AlertCircle } from "lucide-react";
import * as React from "react";

import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import { Input } from "@/components/ui/input";
import { normalizeBarcode } from "@/features/products/barcodes";

/**
 * Código de barras do cadastro, digitado, bipado ou lido pela câmera.
 *
 * A câmera só aparece em tela de toque: no computador o código vem do leitor
 * USB, que digita no campo como um teclado, e o botão seria só ruído.
 *
 * O aviso de "já cadastrado" sai enquanto a pessoa ainda preenche. Antes, a
 * colisão só aparecia ao gravar, e o que tinha sido digitado se perdia na
 * volta. A rota só consulta; quem barra de verdade continua sendo
 * `createProduct`.
 */
export function BarcodeField({
  onConflictChange,
  initialCode = "",
  productId,
  otherCodes = 0,
}: {
  /** Nome do produto que já usa o código, ou `null` quando está livre. */
  onConflictChange?: (productName: string | null) => void;
  /** Na edição, o código que o produto já tem. */
  initialCode?: string;
  /** Na edição, o produto: o código dele mesmo não conta como repetido. */
  productId?: string;
  /** Códigos alternativos do produto, que a edição não altera. */
  otherCodes?: number;
}) {
  const [code, setCode] = React.useState(initialCode);
  // O resultado guarda o código a que se refere: ao editar, o aviso do código
  // anterior some sozinho, sem precisar limpar estado dentro do efeito.
  const [lookup, setLookup] = React.useState<{
    code: string;
    productName: string | null;
  } | null>(null);
  const normalizedCode = normalizeBarcode(code);
  const usedBy =
    lookup?.code === normalizedCode ? lookup.productName : null;
  const conflictRef = React.useRef(onConflictChange);

  React.useEffect(() => {
    conflictRef.current = onConflictChange;
  }, [onConflictChange]);

  React.useEffect(() => {
    // Editou o código: o bloqueio do código anterior não vale mais.
    conflictRef.current?.(null);
    if (!normalizedCode || normalizedCode === normalizeBarcode(initialCode)) {
      return;
    }

    const controller = new AbortController();
    // A pausa evita uma consulta por tecla; a câmera preenche de uma vez e
    // também passa por ela, sem diferença perceptível.
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/produtos/codigo?code=${encodeURIComponent(normalizedCode)}${
            productId ? `&produto=${productId}` : ""
          }`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { productName: string | null };
        setLookup({ code: normalizedCode, productName: body.productName });
        conflictRef.current?.(body.productName);
      } catch {
        // Aviso é cortesia: sem rede ou com a consulta cancelada, o servidor
        // ainda barra o código repetido na hora de gravar.
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedCode, initialCode, productId]);

  const handleDetected = React.useCallback(
    (scanned: string): BarcodeScanOutcome => {
      setCode(scanned);
      return { ok: true, label: `Código ${scanned} lido` };
    },
    [],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          id="barcode"
          name="barcode"
          maxLength={64}
          autoComplete="off"
          placeholder="Bipe ou digite o código"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={usedBy ? true : undefined}
          aria-describedby={usedBy ? "barcode-conflict" : undefined}
        />
        <div className="hidden pointer-coarse:block">
          <BarcodeCameraDialog
            onDetected={handleDetected}
            triggerClassName="pointer-coarse:size-11 pointer-coarse:rounded-lg"
          />
        </div>
      </div>
      {usedBy ? (
        <p
          id="barcode-conflict"
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-xs"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            Este código já pertence a <strong>{usedBy}</strong>. Apague-o ou
            leia o de outra embalagem para cadastrar.
          </span>
        </p>
      ) : initialCode && normalizedCode !== normalizeBarcode(initialCode) ? (
        <p className="text-fg-muted text-xs">
          {normalizedCode
            ? "Vale para as próximas leituras e notas. O que já foi recebido não muda."
            : "Sem código, o produto deixa de ser reconhecido por leitura e por nota."}
        </p>
      ) : (
        <p className="text-fg-subtle text-xs">
          Opcional. Pode ser lido pelo leitor, pela câmera ou digitado.
          {otherCodes === 1
            ? " Há mais 1 código alternativo, que não muda aqui."
            : otherCodes > 1
              ? ` Há mais ${otherCodes} códigos alternativos, que não mudam aqui.`
              : ""}
        </p>
      )}
    </div>
  );
}
