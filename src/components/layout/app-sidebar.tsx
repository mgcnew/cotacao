"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HoverCard } from "radix-ui";
import * as React from "react";

import { CotaProMark } from "@/components/brand/cotapro-logo";
import type {
  NavBadgeKey,
  NavItem,
  NavSubItem,
} from "@/components/layout/nav-items";
import { NavLink, useVisibleNav } from "@/components/layout/nav-list";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NavBadges = Partial<Record<NavBadgeKey, React.ReactNode>>;

/**
 * Contagens dos subitens (`/api/nav-badges`): ao abrir o sistema e de novo a
 * cada entrada em Pedidos, onde as divergências se resolvem. Falhou, o número
 * some — o menu não depende dele.
 */
function useNavBadges(): NavBadges {
  const pathname = usePathname();
  const emPedidos = pathname.startsWith("/pedidos");
  const [divergencias, setDivergencias] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/nav-badges", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { divergencias?: number } | null) => {
        if (data) setDivergencias(Number(data.divergencias) || 0);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [emPedidos]);

  return {
    divergencias:
      divergencias > 0 ? (
        <span
          className="bg-destructive-soft text-destructive min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums"
          aria-label={`${divergencias} a tratar`}
        >
          {divergencias}
        </span>
      ) : null,
  };
}

type Props = {
  companyName: string;
  /** Chaves de permissão do usuário na empresa ativa. */
  permissions: string[];
  /** Como a pessoa deixou o menu da última vez (lido do cookie no servidor). */
  initialCollapsed?: boolean;
};

/** Cookie e não localStorage: o layout precisa ler antes de desenhar. */
export const SIDEBAR_COOKIE = "cotapro_menu_recolhido";

/**
 * Sidebar do desktop.
 *
 * Escondida abaixo de `md`: em tela estreita ela consumiria mais da metade da
 * largura. Lá quem navega é a barra de baixo (MobileTabBar), com os mesmos itens
 * na folha do "Mais".
 */
export function AppSidebar({
  companyName,
  permissions,
  initialCollapsed = false,
}: Props) {
  const badges = useNavBadges();
  const [collapsed, setCollapsedState] = React.useState(initialCollapsed);
  const setCollapsed = React.useCallback((value: boolean) => {
    setCollapsedState(value);
    document.cookie = `${SIDEBAR_COOKIE}=${value ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const { groups, footer, isActive } = useVisibleNav(permissions);

  return (
    // Flutuante: solto do topo, do pé e da borda esquerda, com cantos e
    // sombra no lugar da linha que o separava da página.
    <aside
      data-slot="app-sidebar"
      className={cn(
        "border-border bg-surface my-3 ml-3 hidden shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm md:flex",
        "transition-[width] duration-(--dur) ease-(--ease-ds)",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          // `shrink-0` para o topo não ser espremido quando a lista cresce.
          "flex h-14 shrink-0 items-center gap-2 px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <CotaProMark className="size-7" />
        {!collapsed && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-fg text-sm font-semibold tracking-tight">
              Cota<span className="text-brand">Pro</span>
            </span>
            <span className="text-fg-subtle truncate text-xs">
              {companyName}
            </span>
          </span>
        )}
      </div>

      {/* `min-h-0` é o que permite ao `overflow-y-auto` funcionar dentro de um
          flex: sem ele o item cresce em vez de rolar, e empurra o rodapé para
          fora da tela. Numa janela baixa, ou com muitos itens, a lista rola e
          Configurações/Recolher continuam ancorados embaixo. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {groups.map((group, index) => {
          const items = group.items.filter((item) => !item.mobileOnly);
          if (items.length === 0) return null;
          return (
            <section key={group.label} className={cn(index > 0 && "mt-2")}>
              {!collapsed ? (
                <p className="text-fg-subtle px-2.5 pt-2 pb-1.5 text-xs font-medium">
                  {group.label}
                </p>
              ) : index > 0 ? (
                <div className="border-border mx-2 my-2 border-t" />
              ) : null}
              <div className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <NavEntry
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    active={isActive(item.href)}
                    badges={badges}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
        {footer.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActive(item.href)}
          />
        ))}
        <ExpandToggle
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </div>
    </aside>
  );
}

/**
 * Item do menu com as páginas da seção.
 *
 * Aberto, os subitens aparecem recuados embaixo do item quando se está na
 * seção — fora dela ficam guardados e o menu não cresce. Recolhido, não há
 * onde pô-los: passar o ponteiro (ou focar) abre um menu ao lado do ícone.
 */
function NavEntry({
  item,
  collapsed,
  active,
  badges,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  badges: NavBadges;
}) {
  const pathname = usePathname();
  const children = item.children ?? [];
  if (children.length === 0) {
    return <NavLink item={item} collapsed={collapsed} active={active} />;
  }

  const ativo = (child: NavSubItem) =>
    pathname === child.href || pathname.startsWith(`${child.href}/`);

  if (collapsed) {
    return (
      <HoverCard.Root openDelay={60} closeDelay={120}>
        <HoverCard.Trigger asChild>
          <div>
            <NavLink item={item} collapsed active={active} tooltip={false} />
          </div>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            side="right"
            align="start"
            // Passa a borda do menu flutuante, com o mesmo respiro da margem.
            sideOffset={18}
            className="border-border bg-popover text-popover-foreground data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out z-50 flex w-52 flex-col gap-0.5 rounded-xl border p-1.5 shadow-md"
          >
            <Link
              href={item.href}
              className="text-fg hover:bg-surface-muted rounded-md px-2.5 py-1.5 text-sm font-semibold"
            >
              {item.label}
            </Link>
            {children.map((child) => (
              <SubLink
                key={child.href}
                child={child}
                active={ativo(child)}
                badge={child.badge ? badges[child.badge] : null}
              />
            ))}
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <NavLink item={item} active={active} />
      {active ? (
        <div className="border-border mt-0.5 mb-1 ml-[1.15rem] flex flex-col gap-0.5 border-l pl-2">
          {children.map((child) => (
            <SubLink
              key={child.href}
              child={child}
              active={ativo(child)}
              badge={child.badge ? badges[child.badge] : null}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubLink({
  child,
  active,
  badge,
}: {
  child: NavSubItem;
  active: boolean;
  badge: React.ReactNode;
}) {
  return (
    <Link
      href={child.href}
      aria-current={active ? "page" : undefined}
      data-nav-sub
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
        "transition-colors duration-(--dur) ease-(--ease-ds)",
        active
          ? "bg-surface-muted text-fg font-medium"
          : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{child.label}</span>
      {badge}
    </Link>
  );
}

/** Vizinho dos itens de menu, e recolhido fica só com o ícone: ganha a mesma
 * dica, senão seria o único da coluna sem explicação ao passar o ponteiro. */
function ExpandToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const rotulo = collapsed ? "Expandir menu" : "Recolher menu";
  const botao = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={rotulo}
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
  );

  return collapsed ? <Tooltip content={rotulo}>{botao}</Tooltip> : botao;
}
