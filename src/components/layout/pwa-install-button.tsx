"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function runningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Instala pelo prompt do Chromium e explica o gesto equivalente no iOS. */
export function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const ios = mounted && isAppleMobile();
  const isInstalled = installed || (mounted && runningStandalone());

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (!mounted || isInstalled || (!prompt && !ios)) return null;

  async function install() {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void install()}
        className="text-fg-muted px-2"
        title="Instalar CotaPro"
        aria-label="Instalar CotaPro neste aparelho"
      >
        <Download aria-hidden />
        <span className="hidden xl:inline">Instalar</span>
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Instalar CotaPro no iPhone</DialogTitle>
            <DialogDescription>
              O Safari instala aplicativos pelo menu de compartilhamento.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ol className="text-fg-muted space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="bg-primary-soft text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  1
                </span>
                <span>
                  Toque em <Share className="mx-1 inline size-4" aria-hidden />
                  <strong className="text-fg font-medium">Compartilhar</strong>
                  no Safari.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="bg-primary-soft text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  2
                </span>
                <span>
                  Escolha
                  <strong className="text-fg mx-1 font-medium">
                    Adicionar à Tela de Início
                  </strong>
                  e confirme.
                </span>
              </li>
            </ol>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setShowIosHelp(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
