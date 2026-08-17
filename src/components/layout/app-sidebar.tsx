"use client";

import { ChevronLeft } from "lucide-react";
import * as React from "react";

import { GlobalSearch } from "@/components/layout/global-search";
import { NavLink, useVisibleNav } from "@/components/layout/nav-list";
import { cn } from "@/lib/utils";

type Props = {
  companyName: string;
  /** Chaves de permissão do usuário na empresa ativa. */
  permissions: string[];
};

/**
 * Sidebar do desktop.
 *
 * Escondida abaixo de `md`: em tela estreita ela consumiria mais da metade da
 * largura. Lá quem navega é a gaveta (MobileNav), com os mesmos itens.
 */
export function AppSidebar({ companyName, permissions }: Props) {
  const [collapsed, setCollapsed] = React.useState(false);
  const { operation, footer, isActive } = useVisibleNav(permissions);

  return (
    <aside
      className={cn(
        "border-border bg-surface hidden shrink-0 flex-col border-r md:flex",
        "transition-[width] duration-(--dur) ease-(--ease-ds)",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="bg-primary text-primary-fg grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold">
          {companyName.charAt(0).toUpperCase()}
        </span>
        {!collapsed && (
          <span className="text-fg truncate text-sm font-semibold">
            {companyName}
          </span>
        )}
      </div>

      <GlobalSearch
        collapsed={collapsed}
        onExpand={() => setCollapsed(false)}
      />

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {!collapsed && (
          <p className="text-fg-subtle px-2.5 pt-2 pb-1.5 text-[10px] font-semibold tracking-wider uppercase">
            Operação
          </p>
        )}
        {operation.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActive(item.href)}
          />
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 px-2 pb-2">
        {footer.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActive(item.href)}
          />
        ))}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "text-fg-subtle hover:bg-surface-muted hover:text-fg-muted",
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
            "transition-colors duration-(--dur)",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronLeft
            className={cn(
              "size-4 shrink-0 transition-transform duration-(--dur)",
              collapsed && "rotate-180",
            )}
            aria-hidden
          />
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}
