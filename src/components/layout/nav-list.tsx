"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import {
  FOOTER_NAV,
  OPERATION_NAV,
  type NavItem,
} from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/**
 * Navegação compartilhada entre a sidebar do desktop e a gaveta do celular.
 *
 * Ficar num módulo só evita o clássico: adicionar um item no menu e ele
 * aparecer em uma das duas telas apenas.
 */

export function NavLink({
  item,
  collapsed = false,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
        "transition-colors duration-(--dur) ease-(--ease-ds)",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary-soft text-primary font-medium"
          : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

/** Itens que o usuário pode ver, segundo as permissões da empresa ativa. */
export function useVisibleNav(permissions: string[]) {
  const granted = React.useMemo(() => new Set(permissions), [permissions]);
  const pathname = usePathname();

  return {
    operation: OPERATION_NAV.filter(
      (item) => !item.permission || granted.has(item.permission),
    ),
    footer: FOOTER_NAV,
    isActive: (href: string) =>
      pathname === href || pathname.startsWith(`${href}/`),
  };
}
