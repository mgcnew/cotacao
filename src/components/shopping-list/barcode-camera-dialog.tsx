"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  ZoomIn,
} from "lucide-react";
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

/** O que este aparelho aceita mexer na câmera. Nada disso é padronizado. */
type CameraAbilities = {
  torch: boolean;
  continuousFocus: boolean;
  zoom: { min: number; max: number; step: number } | null;
};

const NO_ABILITIES: CameraAbilities = {
  torch: false,
  continuousFocus: false,
  zoom: null,
};

/**
 * Lê as capacidades da trilha de vídeo.
 *
 * `focusMode`, `torch` e `zoom` não existem no tipo do TS e faltam em vários
 * navegadores (o iOS ignora os três), por isso tudo passa por consulta antes:
 * pedir o que o aparelho não tem só devolveria erro.
 */
function readAbilities(track: MediaStreamTrack | null): CameraAbilities {
  const capabilities = track?.getCapabilities?.() as
    | {
        torch?: boolean;
        focusMode?: string[];
        zoom?: { min: number; max: number; step?: number };
      }
    | undefined;
  if (!capabilities) return NO_ABILITIES;
  return {
    torch: capabilities.torch === true,
    continuousFocus: capabilities.focusMode?.includes("continuous") ?? false,
    zoom: capabilities.zoom
      ? {
          min: capabilities.zoom.min,
          max: capabilities.zoom.max,
          step: capabilities.zoom.step || 0.1,
        }
      : null,
  };
}

/**
 * Aplica foco, lanterna e zoom SEMPRE juntos.
 *
 * `applyConstraints` substitui a lista `advanced` inteira: mandar só a
 * lanterna apagava o foco contínuo pedido na abertura, e mandar só o zoom
 * apagaria os dois. Compor a lista aqui, com o que o aparelho declara
 * suportar, é o que evita esse jogo de um desligar o outro.
 */
async function applyTuning(
  track: MediaStreamTrack | null,
  abilities: CameraAbilities,
  tuning: { torch: boolean; zoom: number | null },
) {
  const constraintSet: Record<string, unknown> = {};
  if (abilities.continuousFocus) constraintSet.focusMode = "continuous";
  if (abilities.torch) constraintSet.torch = tuning.torch;
  if (abilities.zoom && tuning.zoom !== null) constraintSet.zoom = tuning.zoom;
  if (!track || Object.keys(constraintSet).length === 0) return false;
  try {
    await track.applyConstraints({
      advanced: [constraintSet as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * O que a tela dona da câmera fez com o código lido.
 *
 * O `label` não é enfeite: em leitura contínua o diálogo cobre a tela inteira,
 * então a confirmação do que entrou só pode aparecer aqui dentro.
 */
export type BarcodeScanOutcome =
  | { ok: true; label: string }
  | { ok: false; message: string };

type ScanFeedback = BarcodeScanOutcome & { at: number };

export function BarcodeCameraDialog({
  onDetected,
  continuous = false,
  triggerLabel,
  triggerClassName,
}: {
  onDetected: (code: string) => BarcodeScanOutcome;
  /** Segue lendo depois de cada acerto, em vez de fechar no primeiro. */
  continuous?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [abilities, setAbilities] = React.useState<CameraAbilities>(NO_ABILITIES);
  const [torchOn, setTorchOn] = React.useState(false);
  const [zoom, setZoom] = React.useState<number | null>(null);
  const [feedback, setFeedback] = React.useState<ScanFeedback | null>(null);
  const [scanned, setScanned] = React.useState<
    { code: string; label: string; at: number }[]
  >([]);
  // O conteúdo do Dialog nasce em um portal. Guardar o elemento em estado faz
  // a inicialização esperar o portal realmente montar o <video>; com uma ref
  // simples, o efeito podia rodar antes e ficar eternamente em "Iniciando".
  const [videoElement, setVideoElement] = React.useState<HTMLVideoElement | null>(null);
  // Zoom digital muito alto devolve imagem interpolada, que lê pior que a
  // original: o cursor cobre até 4x, onde ainda há barra de verdade. O `min`
  // é a referência porque nem todo aparelho conta a partir de 1 — alguns
  // reportam a escala em porcentagem.
  const zoomCeiling = abilities.zoom
    ? Math.min(abilities.zoom.max, abilities.zoom.min * 4)
    : 0;
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const trackRef = React.useRef<MediaStreamTrack | null>(null);
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
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 700,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              // 1080p custa mais por tentativa (cada uma converte o quadro
              // inteiro em tons de cinza no JS), mas resolução é o que decide
              // se um código pequeno a uma distância que a câmera CONSEGUE
              // focar tem barras separáveis. Tentativa rápida em imagem que
              // não resolve o código não lê nunca.
              width: { ideal: 1920 },
              height: { ideal: 1080 },
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
            if (!code) return;
            const now = Date.now();
            // Lendo em série, a embalagem fica parada na frente da câmera
            // enquanto a pessoa alcança a próxima — e o leitor acerta de novo
            // a cada 700ms. Por isso o instante é renovado a CADA avistamento:
            // a janela passa a contar de quando o código saiu de vista, não de
            // quando entrou, e segurar o mesmo item não adiciona duas vezes.
            const previous = lastCodeRef.current;
            const isRepeat =
              previous?.code === code &&
              now - previous.at < (continuous ? 2500 : 1500);
            lastCodeRef.current = { code, at: now };
            if (isRepeat) return;

            const outcome = onDetectedRef.current(code);
            setFeedback({ ...outcome, at: now });
            if (!outcome.ok) {
              // Padrão diferente do acerto: dá para distinguir sem olhar.
              navigator.vibrate?.([40, 60, 40]);
              return;
            }

            navigator.vibrate?.(continuous ? 40 : 80);
            if (continuous) {
              setScanned((current) =>
                [{ code, label: outcome.label, at: now }, ...current].slice(
                  0,
                  50,
                ),
              );
              return;
            }
            activeControls.stop();
            setOpen(false);
          },
        );

        if (disposed) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setError(null);
        setStarting(false);
        if (startTimeout !== null) window.clearTimeout(startTimeout);
        startTimeout = null;
        // Só depois de baixar o cronômetro de partida: a câmera já está no ar,
        // e um `applyConstraints` lento não pode virar "a câmera demorou".
        const stream = previewElement.srcObject;
        const track =
          stream instanceof MediaStream
            ? (stream.getVideoTracks()[0] ?? null)
            : null;
        trackRef.current = track;
        const found = readAbilities(track);
        const startingZoom = found.zoom
          ? ((track?.getSettings() as { zoom?: number } | undefined)?.zoom ??
            found.zoom.min)
          : null;
        if (!disposed) {
          setAbilities(found);
          setZoom(startingZoom);
        }
        await applyTuning(track, found, { torch: false, zoom: startingZoom });
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
      trackRef.current = null;
      const stream = previewElement.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [continuous, open, videoElement]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setStarting(true);
      setError(null);
      setAbilities(NO_ABILITIES);
      setTorchOn(false);
      setZoom(null);
      setFeedback(null);
      setScanned([]);
    }
    setOpen(nextOpen);
  }

  async function toggleTorch() {
    const next = !torchOn;
    const applied = await applyTuning(trackRef.current, abilities, {
      torch: next,
      zoom,
    });
    if (!applied) {
      setError("A lanterna não pôde ser acionada neste aparelho.");
      return;
    }
    setTorchOn(next);
  }

  function changeZoom(next: number) {
    // Otimista: o controle acompanha o dedo, e o `applyConstraints` que vem
    // atrás não tem como "voltar" um zoom que o aparelho declarou suportar.
    setZoom(next);
    void applyTuning(trackRef.current, abilities, { torch: torchOn, zoom: next });
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
            {continuous
              ? "Bipe um código atrás do outro: a câmera continua aberta e cada acerto aparece na lista."
              : "Aponte a câmera traseira para o código e preencha a imagem com ele."}{" "}
            Nada é enviado ao servidor.
          </DialogDescription>
        </DialogHeader>
        {/* Altura em `dvh` e não o resto da tela: a prévia esticada engolia
            telas pequenas. O corte é só vertical, então a faixa que sobra tem
            a largura inteira — que é a dimensão de que um código de barras
            precisa. O resto da tela fica para a confirmação e a lista. */}
        <DialogBody className="flex flex-col p-0 sm:px-4 sm:py-3">
          <div className="relative h-[38dvh] min-h-44 shrink-0 overflow-hidden bg-black sm:aspect-[4/3] sm:h-auto sm:min-h-0 sm:rounded-xl">
            {/* `object-cover`: em celular a trilha costuma vir em retrato, e
                `contain` deixava a imagem espremida no meio com tarja preta
                dos dois lados — o código nunca chegava a ocupar a largura.
                Cobrir corta em cima e embaixo, nunca nas laterais, e o que
                fica de fora continua sendo lido: o leitor decodifica o quadro
                inteiro, não o recorte visível. Mostrar menos do que é lido é o
                lado seguro do erro. */}
            <video
              ref={setVideoElement}
              autoPlay
              muted
              playsInline
              className="size-full object-cover"
              aria-label="Imagem da câmera para leitura do código de barras"
            />
            {/* A moldura saiu. Ela não recortava nada — o retângulo era só
                desenho —, mas fazia a pessoa afastar o aparelho para encaixar
                o código nele, e código pequeno no quadro é o que falha. Fica a
                linha do meio, que marca de verdade onde o leitor procura: ele
                varre 25 linhas a partir do centro. */}
            <div className="bg-destructive/80 pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 shadow-[0_0_3px_rgb(0_0_0/0.55)]" />
            {/* Zoom em vez de aproximar o aparelho: abaixo da distância mínima
                de foco da lente a imagem não fecha por mais que o autofoco
                tente, e é aí que o código pequeno costuma exigir chegar perto.
                Ampliar resolve o mesmo problema sem sair da distância que a
                câmera consegue focar. */}
            {abilities.zoom && zoom !== null && zoomCeiling > abilities.zoom.min ? (
              <label className="absolute inset-x-3 bottom-2 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                <ZoomIn className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">Aproximar sem mover o aparelho</span>
                <input
                  type="range"
                  min={abilities.zoom.min}
                  max={zoomCeiling}
                  step={abilities.zoom.step}
                  value={zoom}
                  onChange={(event) =>
                    changeZoom(Number(event.target.value))
                  }
                  className="accent-primary min-w-0 flex-1"
                />
                <span className="w-9 shrink-0 text-right tabular-nums">
                  {(zoom / abilities.zoom.min).toFixed(1)}×
                </span>
              </label>
            ) : null}
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-medium text-white">
                Iniciando câmera…
              </div>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="text-destructive px-4 py-3 text-sm sm:px-0 sm:pb-0"
            >
              {error}
            </p>
          ) : feedback ? (
            /* `key` com o instante da leitura: sem ele, dois códigos seguidos
               trocam o texto sem nada se mexer, e no meio de uma sequência
               rápida não dá para ter certeza de que o segundo entrou. */
            <p
              key={feedback.at}
              role={feedback.ok ? "status" : "alert"}
              aria-live="polite"
              className={`animate-ds-in flex items-center gap-2 px-4 py-3 text-sm sm:px-0 sm:pb-0 ${
                feedback.ok ? "text-success" : "text-destructive"
              }`}
            >
              {feedback.ok ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0">
                {feedback.ok ? feedback.label : feedback.message}
              </span>
            </p>
          ) : (
            <p className="text-fg-subtle px-4 py-3 text-xs sm:px-0 sm:pb-0">
              Deixe o código ocupar a largura da imagem e cruzar a linha.
              {abilities.zoom && zoomCeiling > abilities.zoom.min
                ? " Se embaçar de perto, afaste e use o zoom: a lente tem uma distância mínima para focar."
                : abilities.continuousFocus
                  ? " O foco se ajusta sozinho."
                  : " Se a imagem embaçar, afaste um pouco e aproxime de novo."}
            </p>
          )}
          {continuous && scanned.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-0">
              <p className="text-fg-subtle mb-1 text-xs">
                Lidos agora ({scanned.length})
              </p>
              <ul className="divide-border divide-y">
                {scanned.map((item) => (
                  <li
                    key={`${item.code}:${item.at}`}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {item.label}
                    </span>
                    <code className="text-fg-subtle shrink-0 text-xs">
                      {item.code}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {abilities.torch ? (
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
            <Button
              type="button"
              size="sm"
              variant={continuous && scanned.length > 0 ? "default" : "ghost"}
              className="ml-auto"
            >
              {continuous && scanned.length > 0
                ? `Concluir (${scanned.length})`
                : "Fechar"}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
