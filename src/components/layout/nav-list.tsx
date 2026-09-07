"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import {
  FOOTER_NAV,
  NAV_GROUPS,
  type NavItem,
} from "@/components/layout/nav-items";
import { Tooltip } from "@/components/ui/tooltip";
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
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // Recolhido, o rótulo some da tela e o ícone é `aria-hidden`: sem este
      // nome o item ficaria anônimo. Antes quem o dava era o `title`, que a
      // dica com tema não repõe — ela descreve, não nomeia.
      aria-label={collapsed ? item.label : undefined}
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

  // Só recolhido: com o rótulo ao lado do ícone, a dica repetiria o que já
  // está escrito.
  return collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link;
}

/** Itens que o usuário pode ver, segundo as permissões da empresa ativa. */
export function useVisibleNav(permissions: string[]) {
  const granted = React.useMemo(() => new Set(permissions), [permissions]);
  const pathname = usePathname();

  return {
    groups: NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || granted.has(item.permission),
      ),
    })).filter((group) => group.items.length > 0),
    footer: FOOTER_NAV,
    isActive: (href: string) =>
      pathname === href || pathname.startsWith(`${href}/`),
  };
}
