"use client";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * O menu de "o resto está aqui".
 *
 * Existe para que uma tela tenha uma ação primária como botão e todas as
 * ocasionais atrás de um gatilho só. Não é lugar do que se faz todo dia: o que
 * entra aqui custa um clique a mais e deixa de ancorar o olho.
 *
 * Sobre o Popover do `searchable-select`: aquele é uma caixa de sugestões
 * presa a um campo. Este segue o papel `menu` do ARIA — navega por setas,
 * fecha no Esc, devolve o foco ao gatilho e lê como menu no leitor de tela.
 */
function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "border-border bg-popover text-popover-foreground data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out z-[100] min-w-56 overflow-hidden rounded-lg border p-1 shadow-xl outline-none",
          "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group
      data-slot="dropdown-menu-group"
      className={cn("py-1", className)}
      {...props}
    />
  );
}

/** Rótulo do grupo. `Label` do Radix já sai com `aria-hidden` correto: quem
 * usa leitor de tela recebe o agrupamento pelo `group`, não pelo texto. */
function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn(
        "text-fg-subtle px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

/**
 * `highlighted` e não `hover`: o Radix marca com ele tanto o item sob o
 * ponteiro quanto o alcançado por seta, então teclado e mouse acendem igual.
 */
function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /**
   * `destructive` para o que não tem volta — excluir, revogar, descartar.
   *
   * O vermelho mora no texto e no ícone, não num fundo cheio: dentro de uma
   * lista de itens iguais, uma faixa vermelha chamaria mais atenção que a ação
   * principal do menu. Ele só acende de vez quando o item está sob o ponteiro
   * ou sob a seta do teclado — que é quando a pessoa está prestes a escolhê-lo.
   */
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        variant === "destructive"
          ? "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-destructive/20"
          : "text-fg data-[highlighted]:bg-surface-muted data-[highlighted]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** O número à direita do item — quantas categorias, quantas unidades. */
function DropdownMenuBadge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-badge"
      className={cn(
        "text-fg-subtle ml-auto pl-3 text-xs tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuBadge,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
