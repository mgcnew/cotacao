"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import * as React from "react";

export const ACCENTS = [
  "indigo",
  "blue",
  "purple",
  "green",
  "orange",
  "red",
] as const;

export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = "indigo";

const ACCENT_STORAGE_KEY = "cotacao.accent";

function isAccent(value: string | null): value is Accent {
  return value !== null && (ACCENTS as readonly string[]).includes(value);
}

/**
 * O accent vive no localStorage, que é um sistema externo ao React — daí o
 * useSyncExternalStore em vez de estado + efeito. Isso também mantém abas
 * diferentes em sincronia, já que o evento `storage` está na inscrição.
 */
const accentStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    accentStore.listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      accentStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },

  getSnapshot(): Accent {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(stored) ? stored : DEFAULT_ACCENT;
  },

  // No servidor não há localStorage: o HTML sai sempre com o accent padrão.
  getServerSnapshot(): Accent {
    return DEFAULT_ACCENT;
  },

  set(accent: Accent) {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    for (const listener of accentStore.listeners) listener();
  },
};

type AccentContextValue = {
  accent: Accent;
  setAccent: (accent: Accent) => void;
};

const AccentContext = React.createContext<AccentContextValue | null>(null);

export function useAccent() {
  const ctx = React.useContext(AccentContext);
  if (!ctx) {
    throw new Error("useAccent precisa estar dentro de <ThemeProvider>");
  }
  return ctx;
}

/**
 * O modo (light/dark/system) fica com o next-themes, que escreve a classe
 * `dark` no <html>. O accent é ortogonal e vai em `data-accent`, do mesmo
 * jeito que o protótipo do Design faz.
 */
function AccentProvider({ children }: { children: React.ReactNode }) {
  const accent = React.useSyncExternalStore(
    accentStore.subscribe,
    accentStore.getSnapshot,
    accentStore.getServerSnapshot,
  );

  // Sincroniza o DOM com o estado — este é o uso legítimo de efeito.
  React.useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const value = React.useMemo(
    () => ({ accent, setAccent: accentStore.set }),
    [accent],
  );

  return (
    <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
  );
}

/**
 * Os portais que abrem por link nascem claros, sempre.
 *
 * Quem abre esse link não é usuário do sistema: é o vendedor do fornecedor,
 * no celular dele, com o tema que ele escolheu para o aparelho — e não faz
 * sentido um documento que representa a empresa mudar de cara conforme a
 * configuração de quem recebeu.
 *
 * `forcedTheme` do next-themes aplica o claro sem gravar nada: a preferência
 * de quem também usa o sistema continua intacta quando ele voltar às telas
 * internas. Trocar o tema por `setTheme` faria o oposto — mudaria o app
 * inteiro só por ter aberto um link.
 */
function temaForcado(pathname: string): string | undefined {
  return pathname.startsWith("/q/") || pathname.startsWith("/r/")
    ? "light"
    : undefined;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={temaForcado(pathname)}
    >
      <AccentProvider>{children}</AccentProvider>
    </NextThemesProvider>
  );
}
