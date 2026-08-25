"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={!mounted}
      aria-label={label}
      title={label}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="text-fg-muted"
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
