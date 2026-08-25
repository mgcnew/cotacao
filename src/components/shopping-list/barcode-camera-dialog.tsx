"use client";

import type { IScannerControls } from "@zxing/browser";
import { Camera, Flashlight, FlashlightOff } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function cameraErrorMessage(error: unknown) {
  if (!window.isSecureContext) {
    return "A câmera só funciona em uma conexão segura (HTTPS).";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "A permissão da câmera foi negada. Libere-a nas configurações do navegador e tente novamente.";
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "OverconstrainedError"
    ) {
      return "Nenhuma câmera compatível foi encontrada neste aparelho.";
    }
    if (error.name === "NotReadableError") {
      return "A câmera está sendo usada por outro aplicativo ou não pôde ser iniciada.";
    }
  }
  return "Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.";
}

export function BarcodeCameraDialog({
  onDetected,
  triggerLabel,
  triggerClassName,
}: {
  /** Retorne uma mensagem quando o código não puder ser aceito. */
  onDetected: (code: string) => string | null;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canUseTorch, setCanUseTorch] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  // O conteúdo do Dialog nasce em um portal. Guardar o elemento em estado faz
  // a inicialização esperar o portal realmente montar o <video>; com uma ref
  // simples, o efeito podia rodar antes e ficar eternamente em "Iniciando".
  const [videoElement, setVideoElement] = React.useState<HTMLVideoElement | null>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const onDetectedRef = React.useRef(onDetected);
  const lastCodeRef = React.useRef<{ code: string; at: number } | null>(null);

  React.useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  React.useEffect(() => {
    if (!open || !videoElement) return;

    const previewElement = videoElement;
    let disposed = false;
    let startTimeout: number | null = null;
    lastCodeRef.current = null;

    async function start() {
      if (!window.isSecureContext) {
        setError("A câmera só funciona em uma conexão segura (HTTPS).");
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não oferece acesso à câmera.");
        setStarting(false);
        return;
      }

      startTimeout = window.setTimeout(() => {
        if (disposed) return;
        setError("A câmera demorou para responder. Feche, confira a permissão do navegador e tente novamente.");
        setStarting(false);
      }, 12_000);

      try {
        // O leitor só entra no bundle quando a pessoa realmente abre a câmera.
        const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
        if (disposed) return;

        const reader = new BrowserMultiFormatOneDReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 700,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          previewElement,
          (result, _scanError, activeControls) => {
            if (!result) return;
            const code = result
              .getText()
              .trim()
              .replace(/\s+/g, "")
              .toUpperCase();
            const now = Date.now();
            if (
              !code ||
              (lastCodeRef.current?.code === code &&
                now - lastCodeRef.current.at < 1500)
            ) {
              return;
            }
            lastCodeRef.current = { code, at: now };

            const rejection = onDetectedRef.current(code);
            if (rejection) {
              setError(rejection);
              return;
            }

            navigator.vibrate?.(80);
            activeControls.stop();
            setOpen(false);
          },
        );

        if (disposed) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCanUseTorch(Boolean(controls.switchTorch));
        setError(null);
        setStarting(false);
        if (startTimeout !== null) window.clearTimeout(startTimeout);
        startTimeout = null;
      } catch (startError) {
        if (!disposed) {
          setError(cameraErrorMessage(startError));
          setStarting(false);
        }
        if (startTimeout !== null) window.clearTimeout(startTimeout);
        startTimeout = null;
      }
    }

    void start();
    return () => {
      disposed = true;
      if (startTimeout !== null) window.clearTimeout(startTimeout);
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = previewElement.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open, videoElement]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setStarting(true);
      setError(null);
      setCanUseTorch(false);
      setTorchOn(false);
    }
    setOpen(nextOpen);
  }

  async function toggleTorch() {
    const switchTorch = controlsRef.current?.switchTorch;
    if (!switchTorch) return;
    const next = !torchOn;
    try {
      await switchTorch(next);
      setTorchOn(next);
    } catch {
      setError("A lanterna não pôde ser acionada neste aparelho.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size={triggerLabel ? "default" : "icon-sm"}
          variant="outline"
          className={triggerClassName}
          aria-label="Ler código de barras com a câmera"
          title="Ler com a câmera"
        >
          <Camera className="size-4" aria-hidden />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Ler código de barras</DialogTitle>
          <DialogDescription>
            Aponte a câmera traseira para o código e mantenha o aparelho firme.
            A imagem não é enviada ao servidor.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden rounded-xl">
            <video
              ref={setVideoElement}
              autoPlay
              muted
              playsInline
              className="size-full object-cover"
              aria-label="Imagem da câmera para leitura do código de barras"
            />
            <div className="pointer-events-none absolute inset-[18%_8%] rounded-lg border-2 border-white/90 shadow-[0_0_0_999px_rgb(0_0_0/0.28)]" />
            <div className="bg-destructive pointer-events-none absolute top-1/2 right-[8%] left-[8%] h-0.5 shadow-[0_0_8px_rgb(255_255_255/0.8)]" />
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-medium text-white">
                Iniciando câmera…
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {error}
            </p>
          ) : (
            <p className="text-fg-subtle mt-3 text-xs">
              Para ler melhor, deixe o código inteiro dentro do retângulo e
              evite reflexos.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {canUseTorch ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={toggleTorch}
            >
              {torchOn ? (
                <FlashlightOff className="size-3.5" aria-hidden />
              ) : (
                <Flashlight className="size-3.5" aria-hidden />
              )}
              {torchOn ? "Apagar lanterna" : "Acender lanterna"}
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" size="sm" variant="ghost" className="ml-auto">
              Fechar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
