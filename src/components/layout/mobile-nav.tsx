"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { CotaProMark } from "@/components/brand/cotapro-logo";
import { NavLink, useVisibleNav } from "@/components/layout/nav-list";

type Props = {
  companyName: string;
  permissions: string[];
};

/**
 * Navegação do celular: botão no header que abre uma gaveta lateral.
 *
 * A gaveta fecha ao clicar num item (via onNavigate) em vez de reagir à
 * mudança de rota num efeito — menos estado sincronizado, menos chance de
 * ficar aberta depois de navegar.
 *
 * É um diálogo do Radix: prende o foco, fecha com Esc, deixa o resto da página
 * inerte para o leitor de tela e devolve o foco ao botão que a abriu. Antes era
 * um `<div>` por cima, e o Tab escapava para a página de trás.
 */
export function MobileNav({ companyName, permissions }: Props) {
  const [open, setOpen] = React.useState(false);
  const { groups, footer, isActive } = useVisibleNav(permissions);
  const mobileGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.desktopOnly),
    }))
    .filter((group) => group.items.length > 0);

  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-8 place-items-center rounded-md transition-colors duration-(--dur) md:hidden pointer-coarse:size-11"
        >
          <Menu className="size-4" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        {/* Fundo clicável: fechar tocando fora é o gesto esperado no celular. */}
        <DialogPrimitive.Overlay className="data-[state=open]:animate-ds-fade data-[state=closed]:animate-ds-fade-out fixed inset-0 z-50 bg-black/30 md:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="border-border bg-surface fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r pb-[env(safe-area-inset-bottom)] outline-none md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <div className="flex h-14 items-center gap-2 px-3">
            <CotaProMark className="size-7" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-fg text-sm font-semibold tracking-tight">
                Cota<span className="text-brand">Pro</span>
              </span>
              <span className="text-fg-subtle truncate text-xs">
                {companyName}
              </span>
            </span>
            <DialogPrimitive.Close
              aria-label="Fechar menu"
              className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-8 place-items-center rounded-md pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
            {mobileGroups.map((group, index) => (
              <section
                key={group.label}
                className={index > 0 ? "mt-2" : undefined}
              >
                <p className="text-fg-subtle px-2.5 pt-2 pb-1.5 text-xs font-medium">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      onNavigate={close}
                    />
                  ))}
                </div>
              </section>
            ))}
          </nav>

          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {footer.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={close}
              />
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
