"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import {
  ACCENTS,
  type Accent,
  useAccent,
} from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/** Atalho binário do topo; a opção "seguir o sistema" continua nas configurações. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Ativar modo claro" : "Ativar modo escuro";

  return (
    <Tooltip content={label} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!mounted}
        aria-label={label}
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="text-fg-muted"
      >
        {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </Tooltip>
  );
}

const MODOS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

/**
 * Percorre claro → escuro → sistema, ao lado do sino.
 *
 * O ícone mostra o modo atual, não o destino: com três estados, o destino
 * sozinho não diria em qual deles a pessoa está. O texto do tooltip diz os dois.
 */
export function ThemeModeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Antes da hidratação o tema ainda não é conhecido no cliente: mostra o
  // padrão, igual ao servidor, para não divergir do HTML renderizado.
  const atual =
    (mounted && MODOS.find((m) => m.value === theme)) || MODOS[2];
  const proximo = MODOS[(MODOS.indexOf(atual) + 1) % MODOS.length];
  const label = `Tema: ${atual.label}. Trocar para ${proximo.label}`;
  const Icon = atual.icon;

  return (
    <Tooltip content={label} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!mounted}
        aria-label={label}
        onClick={() => setTheme(proximo.value)}
        className="text-fg-muted"
      >
        <Icon aria-hidden />
      </Button>
    </Tooltip>
  );
}

const NOMES_DAS_CORES: Record<Accent, string> = {
  indigo: "Índigo",
  blue: "Azul",
  purple: "Roxo",
  green: "Verde",
  orange: "Laranja",
  red: "Vermelho",
};

/**
 * Percorre as cores primárias disponíveis, ao lado do sino.
 *
 * A bolinha usa `bg-primary`, que já segue o `data-accent` do <html>: ela
 * mostra a cor atual sem precisar de um mapa de cores aqui.
 */
export function AccentToggle() {
  const { accent, setAccent } = useAccent();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const indice = ACCENTS.indexOf(accent);
  const proxima = ACCENTS[(indice + 1) % ACCENTS.length];
  const label = `Cor: ${NOMES_DAS_CORES[accent]}. Trocar para ${NOMES_DAS_CORES[proxima]}`;

  return (
    <Tooltip content={label} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!mounted}
        aria-label={label}
        onClick={() => setAccent(proxima)}
      >
        <span
          aria-hidden
          className="bg-primary ring-border size-3.5 rounded-full ring-1"
        />
      </Button>
    </Tooltip>
  );
}
