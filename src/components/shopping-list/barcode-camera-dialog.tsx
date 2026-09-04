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

/**
 * Pede foco contínuo ao aparelho, quando ele souber fazer isso.
 *
 * `focusMode` ainda não é padrão (não existe no tipo do TS e o iOS ignora),
 * por isso a capacidade é consultada antes: sem o modo na lista, aplicar a
 * restrição só devolveria erro. Retorna se o foco contínuo ficou de fato ativo,
 * porque a dica exibida embaixo do vídeo muda conforme a resposta.
 */
async function enableContinuousFocus(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0];
  if (!track?.getCapabilities) return false;
  try {
    const modes = (track.getCapabilities() as { focusMode?: string[] })
      .focusMode;
    if (!modes?.includes("continuous")) return false;
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
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
  const [continuousFocus, setContinuousFocus] = React.useState(false);
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

        // 720p e não 1080p de propósito: cada tentativa converte o quadro
        // inteiro em tons de cinza no JS, então mais pixels significam menos
        // tentativas por segundo — e o que falha aqui é o foco, não a nitidez.
        const reader = new BrowserMultiFormatOneDReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 700,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // Restrições `advanced` são "melhor esforço": onde `focusMode`
              // não existe, o navegador descarta em vez de falhar. Pedir já na
              // abertura evita o primeiro quadro fora de foco.
              advanced: [
                { focusMode: "continuous" } as unknown as MediaTrackConstraintSet,
              ],
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
        // Só depois de baixar o cronômetro de partida: a câmera já está no ar,
        // e um `applyConstraints` lento não pode virar "a câmera demorou".
        const stream = previewElement.srcObject;
        const focusing = await enableContinuousFocus(
          stream instanceof MediaStream ? stream : null,
        );
        if (!disposed) setContinuousFocus(focusing);
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
      setContinuousFocus(false);
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
      // A lanterna é ligada por `applyConstraints({ advanced: [...] })`, e essa
      // lista SUBSTITUI a anterior — o foco contínuo pedido na abertura vai
      // junto. Por isso ele é pedido de novo a cada acionamento.
      const stream = videoElement?.srcObject;
      setContinuousFocus(
        await enableContinuousFocus(
          stream instanceof MediaStream ? stream : null,
        ),
      );
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
            Aponte a câmera traseira para o código e preencha a imagem com ele.
            Nada é enviado ao servidor.
          </DialogDescription>
        </DialogHeader>
        {/* No celular o diálogo é a tela inteira, e a prévia de 4:3 deixava
            metade dela vazia. Aqui ela ocupa a altura que sobra; a caixa fixa
            volta no desktop, onde o diálogo é uma caixa de verdade. */}
        <DialogBody className="flex flex-col p-0 sm:px-4 sm:py-3">
          <div className="relative min-h-56 flex-1 overflow-hidden bg-black sm:aspect-[4/3] sm:min-h-0 sm:flex-none sm:rounded-xl">
            {/* `object-contain`, e não `cover`: o leitor decodifica o quadro
                inteiro, então recortar a imagem só escondia área que estava
                sendo lida — a pessoa afastava o aparelho à toa. */}
            <video
              ref={setVideoElement}
              autoPlay
              muted
              playsInline
              className="size-full object-contain"
              aria-label="Imagem da câmera para leitura do código de barras"
            />
            {/* A moldura saiu. Ela não recortava nada — o retângulo era só
                desenho —, mas fazia a pessoa afastar o aparelho para encaixar
                o código nele, e código pequeno no quadro é o que falha. Fica a
                linha do meio, que marca de verdade onde o leitor procura: ele
                varre 25 linhas a partir do centro. */}
            <div className="bg-destructive/80 pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 shadow-[0_0_3px_rgb(0_0_0/0.55)]" />
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-medium text-white">
                Iniciando câmera…
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-destructive px-4 py-3 text-sm sm:px-0 sm:pb-0">
              {error}
            </p>
          ) : (
            <p className="text-fg-subtle px-4 py-3 text-xs sm:px-0 sm:pb-0">
              Aproxime até o código ocupar a largura da imagem e cruzar a linha.
              {continuousFocus
                ? " O foco se ajusta sozinho."
                : " Se a imagem embaçar, afaste um pouco e aproxime de novo."}
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
