"use client";

import Link, { useLinkStatus } from "next/link";
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

/**
 * Acende o item assim que o clique acontece, sem esperar o servidor. Só aparece
 * quando a rota não estava pré-carregada — com a casca já no cliente a troca é
 * imediata e o estado pendente nem chega a existir.
 *
 * Fica dentro do `Link` porque `useLinkStatus` só enxerga o link ancestral; o
 * estilo sai do pai por `has-[[data-pendente]]`.
 */
function MarcaDePendente() {
  const { pending } = useLinkStatus();
  return pending ? <span data-pendente aria-hidden className="hidden" /> : null;
}

export function NavLink({
  item,
  collapsed = false,
  active,
  onNavigate,
  tooltip = true,
  badge,
  withArrow = false,
}: {
  item: NavItem;
  collapsed?: boolean;
  active: boolean;
  onNavigate?: () => void;
  /** Recolhido com subitens, quem explica o ícone é o menu flutuante. */
  tooltip?: boolean;
  /** Contagem à direita (aberto) ou ponto sobre o ícone (recolhido). */
  badge?: number;
  /** Deixa lugar para a seta dos subitens, que é um botão irmão do link. */
  withArrow?: boolean;
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
      data-nav-item
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem]",
        "transition-colors duration-(--dur) ease-(--ease-ds)",
        collapsed && "justify-center px-0",
        withArrow && !collapsed && "pr-9",
        "has-[[data-pendente]]:text-fg",
        // O ativo é uma barrinha na borda do menu sobre um fundo liso e
        // discreto — não um bloco de cor: com menos linhas, é ela que diz onde
        // se está sem pesar no resto.
        active
          ? "text-fg bg-surface-muted font-medium before:bg-primary before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r-full"
          : "text-fg-muted hover:bg-surface-muted/70 hover:text-fg",
      )}
    >
      <MarcaDePendente />
      <Icon
        className={cn("size-[1.125rem] shrink-0", active && "text-primary")}
        aria-hidden
      />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
      {badge ? (
        collapsed ? (
          <span
            className="bg-destructive ring-surface absolute top-1.5 right-2 size-2 rounded-full ring-2"
            aria-label={`${badge} a tratar`}
          />
        ) : (
          <span
            className="bg-destructive text-destructive-foreground min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums"
            aria-label={`${badge} a tratar`}
          >
            {badge}
          </span>
        )
      ) : null}
    </Link>
  );

  // Só recolhido: com o rótulo ao lado do ícone, a dica repetiria o que já
  // está escrito.
  return collapsed && tooltip ? (
    <Tooltip content={item.label}>{link}</Tooltip>
  ) : (
    link
  );
}

/** Itens que o usuário pode ver, segundo as permissões da empresa ativa. */
export function useVisibleNav(permissions: string[]) {
  const granted = React.useMemo(() => new Set(permissions), [permissions]);
  const pathname = usePathname();

  return {
    groups: NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.permission || granted.has(item.permission))
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => !child.permission || granted.has(child.permission),
          ),
        })),
    })).filter((group) => group.items.length > 0),
    footer: FOOTER_NAV,
    isActive: (href: string) =>
      pathname === href || pathname.startsWith(`${href}/`),
  };
}
