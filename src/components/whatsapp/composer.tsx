"use client";

import { SendHorizontal, WifiOff } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 4000;
const SHOW_COUNTER_AT = 3500;

/**
 * Campo de mensagem.
 *
 * O texto vive no pai, por conversa: quem sai de uma conversa no meio de uma
 * frase para olhar outra a encontra como deixou. Enter envia no computador;
 * no celular ele pula linha (o teclado já tem o botão de enviar), porque
 * mandar uma mensagem pela metade com um toque errado não tem volta.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabledReason,
  canManageConnection,
  focusKey,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Por que não dá para escrever; vazio quando dá. */
  disabledReason: string | null;
  canManageConnection: boolean;
  /** Muda a cada conversa aberta e devolve o foco ao campo. */
  focusKey: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const empty = value.trim().length === 0;

  React.useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 168)}px`;
  }, [value]);

  React.useEffect(() => {
    if (disabledReason) return;
    // No celular, focar sozinho abre o teclado por cima da conversa recém-aberta.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    ref.current?.focus();
  }, [focusKey, disabledReason]);

  if (disabledReason) {
    return (
      <div className="border-border bg-surface-sunken flex shrink-0 items-center gap-3 border-t px-4 py-3">
        <WifiOff className="text-fg-subtle size-4 shrink-0" aria-hidden />
        <p className="text-fg-muted min-w-0 flex-1 text-sm">{disabledReason}</p>
        {canManageConnection ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/configuracoes?aba=whatsapp">Reconectar</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!empty) onSend();
      }}
      className="border-border bg-surface shrink-0 border-t px-3 py-2.5 sm:px-4"
    >
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="whatsapp-composer" className="sr-only">
            Mensagem
          </label>
          <textarea
            ref={ref}
            id="whatsapp-composer"
            rows={1}
            value={value}
            maxLength={MAX_LENGTH}
            placeholder="Escreva uma mensagem"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.nativeEvent.isComposing) return;
              if (window.matchMedia("(pointer: coarse)").matches) return;
              event.preventDefault();
              if (!empty) onSend();
            }}
            className="border-input bg-input-bg text-fg placeholder:text-fg-subtle focus:border-ring focus:ring-ring/30 block max-h-42 min-h-11 w-full resize-none rounded-xl border px-3.5 py-2.5 text-base leading-snug outline-none focus:ring-3 sm:text-sm"
          />
          {value.length >= SHOW_COUNTER_AT ? (
            <span
              className={cn(
                "bg-surface absolute right-2 bottom-1 rounded px-1 text-xs tabular-nums",
                value.length >= MAX_LENGTH - 100 ? "text-destructive" : "text-fg-subtle",
              )}
            >
              {value.length}/{MAX_LENGTH}
            </span>
          ) : null}
        </div>
        <Button
          type="submit"
          size="icon-lg"
          disabled={empty}
          aria-label="Enviar mensagem"
          className="size-11 rounded-xl"
        >
          <SendHorizontal aria-hidden />
        </Button>
      </div>
      <p className="text-fg-subtle mt-1.5 hidden px-1 text-xs pointer-fine:block">
        Enter envia · Shift + Enter pula linha
      </p>
    </form>
  );
}
