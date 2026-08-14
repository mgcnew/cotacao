"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { ACCENTS, useAccent } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

export function ThemeControls() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();

  // O tema só é conhecido no cliente; até a hidratação o controle fica inerte
  // para não divergir do HTML renderizado no servidor.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-fg-muted text-xs font-medium">Tema</span>
        <div className="border-border bg-surface flex gap-0.5 rounded-md border p-0.5">
          {MODES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mounted && theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "h-7 gap-1.5 px-2.5 text-xs font-normal",
                mounted &&
                  theme === value &&
                  "bg-primary-soft text-primary font-medium",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-fg-muted text-xs font-medium">Cor</span>
        <div className="flex gap-1.5">
          {ACCENTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccent(value)}
              aria-label={`Accent ${value}`}
              aria-pressed={accent === value}
              data-accent={value}
              className={cn(
                "bg-primary size-5 rounded-full transition-[box-shadow]",
                "duration-(--dur) ease-(--ease-ds)",
                accent === value
                  ? "ring-primary ring-offset-background ring-2 ring-offset-2"
                  : "hover:ring-border-strong hover:ring-2 hover:ring-offset-2",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
