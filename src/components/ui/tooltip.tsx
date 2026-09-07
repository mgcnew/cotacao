"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Balão de dica com a cara do sistema, no lugar do `title` do navegador.
 *
 * O `title` é sempre do sistema operacional: fonte, cor e atraso não são
 * nossos, ele ignora o tema e aparece meio segundo depois do que se espera.
 *
 * **Ele não substitui o nome acessível.** O Radix aponta o conteúdo por
 * `aria-describedby`, que é descrição e não nome — um botão só de ícone
 * embrulhado aqui continua anônimo no leitor de tela. Quem usa este
 * componente num alvo sem texto visível precisa dar `aria-label` ao gatilho.
 * Era justamente o `title` que fazia esse papel antes, e por isso trocar um
 * pelo outro sem cuidado deixaria o menu recolhido sem nome nenhum.
 */
function Tooltip({
  children,
  content,
  side = "right",
  sideOffset = 8,
  delayDuration = 200,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Root>, "children"> & {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
  sideOffset?: number;
  delayDuration?: number;
}) {
  return (
    // Provider por dica: o `skipDelayDuration` do Radix serve para percorrer
    // vários alvos sem esperar de novo, e aqui cada item é uma parada.
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root {...props}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            side={side}
            sideOffset={sideOffset}
            collisionPadding={8}
            className={cn(
              "border-border bg-popover text-fg data-[state=delayed-open]:animate-ds-in",
              "z-[100] max-w-56 rounded-md border px-2 py-1 text-xs font-medium shadow-lg",
              "select-none",
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip };
