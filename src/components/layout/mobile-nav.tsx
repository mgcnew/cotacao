"use client";

import { Menu, X } from "lucide-react";
import * as React from "react";

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
 */
export function MobileNav({ companyName, permissions }: Props) {
  const [open, setOpen] = React.useState(false);
  const { operation, footer, isActive } = useVisibleNav(permissions);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={open}
        className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-8 place-items-center rounded-md transition-colors duration-(--dur)"
      >
        <Menu className="size-4" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          {/* Fundo clicável: fechar tocando fora é o gesto esperado no celular. */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={close}
            className="bg-fg/30 absolute inset-0"
          />

          <div className="border-border bg-surface relative flex h-full w-64 max-w-[80vw] flex-col border-r">
            <div className="flex h-14 items-center gap-2 px-3">
              <span className="bg-primary text-primary-fg grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold">
                {companyName.charAt(0).toUpperCase()}
              </span>
              <span className="text-fg flex-1 truncate text-sm font-semibold">
                {companyName}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar menu"
                className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-8 place-items-center rounded-md"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
              <p className="text-fg-subtle px-2.5 pt-2 pb-1.5 text-[10px] font-semibold tracking-wider uppercase">
                Operação
              </p>
              {operation.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onNavigate={close}
                />
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
