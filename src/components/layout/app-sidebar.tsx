"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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

type NavBadges = Partial<Record<NavBadgeKey, number>>;

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

  return { divergencias };
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
        "border-border bg-surface my-3 ml-3 hidden shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm md:flex",
        "transition-[width] duration-(--dur) ease-(--ease-ds)",
        collapsed ? "w-16" : "w-60",
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
            <section
              key={group.label}
              className={cn(
                index > 0 && "border-border/70 mt-2.5 border-t pt-2.5",
                index > 0 && collapsed && "mx-1",
              )}
            >
              {!collapsed ? (
                <p className="text-fg-subtle px-3 pt-1.5 pb-2 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
                  {group.label}
                </p>
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
 * Os subitens moram num painel ao lado, que só aparece quando se precisa:
 * passando o ponteiro, clicando na seta ou com → no teclado. Clicar no nome
 * continua indo à página da seção. A contagem dos subitens (divergências a
 * tratar) sobe para o item, para o aviso não ficar escondido no painel.
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
  const [open, setOpen] = React.useState(false);
  const painel = React.useRef<HTMLDivElement>(null);
  const children = item.children ?? [];
  const contagem = (child: NavSubItem) =>
    child.badge ? (badges[child.badge] ?? 0) : 0;
  const total = children.reduce((soma, child) => soma + contagem(child), 0);

  if (children.length === 0) {
    return <NavLink item={item} collapsed={collapsed} active={active} />;
  }

  const ativo = (child: NavSubItem) =>
    pathname === child.href || pathname.startsWith(`${child.href}/`);

  // Pelo teclado o painel abre e já recebe o foco: ele mora num portal, no
  // fim da página, e o Tab sozinho nunca chegaria lá.
  function abrirPeloTeclado() {
    setOpen(true);
    window.requestAnimationFrame(() =>
      painel.current?.querySelector<HTMLAnchorElement>("a")?.focus(),
    );
  }

  return (
    <HoverCard.Root
      open={open}
      onOpenChange={setOpen}
      openDelay={120}
      closeDelay={160}
    >
      <HoverCard.Trigger asChild>
        <div
          className="relative"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              abrirPeloTeclado();
            }
          }}
        >
          <NavLink
            item={item}
            collapsed={collapsed}
            active={active}
            tooltip={false}
            badge={total}
            withArrow
          />
          {!collapsed ? (
            <button
              type="button"
              aria-label={`Mais em ${item.label}`}
              aria-expanded={open}
              onClick={() => (open ? setOpen(false) : abrirPeloTeclado())}
              className={cn(
                "text-fg-subtle hover:text-fg hover:bg-surface-muted absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md",
                "transition-colors duration-(--dur)",
                open && "text-fg",
              )}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          ref={painel}
          side="right"
          align="start"
          // Passa a borda do menu flutuante, com o mesmo respiro da margem.
          sideOffset={collapsed ? 18 : 14}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          data-slot="app-sidebar-panel"
          className="text-fg data-[state=open]:animate-ds-in data-[state=closed]:animate-ds-out z-50 flex w-56 flex-col gap-0.5 rounded-xl border p-2"
        >
          <p className="text-fg-subtle px-3 pt-1 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            {item.label}
          </p>
          {collapsed ? (
            <SubLink
              child={{
                href: item.href,
                label: `Ver ${item.label.toLowerCase()}`,
              }}
              active={pathname === item.href}
              count={0}
            />
          ) : null}
          {children.map((child) => (
            <SubLink
              key={child.href}
              child={child}
              active={ativo(child)}
              count={contagem(child)}
            />
          ))}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function SubLink({
  child,
  active,
  count,
}: {
  child: NavSubItem;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={child.href}
      aria-current={active ? "page" : undefined}
      data-nav-sub
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-[0.9375rem]",
        "focus-visible:ring-ring/50 transition-colors duration-(--dur) ease-(--ease-ds) outline-none focus-visible:ring-3",
        active
          ? "bg-surface-muted text-fg font-medium"
          : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{child.label}</span>
      {count > 0 ? (
        <span
          className="bg-destructive text-destructive-foreground min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums"
          aria-label={`${count} a tratar`}
        >
          {count}
        </span>
      ) : null}
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
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem]",
        "transition-colors duration-(--dur)",
        collapsed && "justify-center px-0",
      )}
    >
      <ChevronLeft
        className={cn(
          "size-[1.125rem] shrink-0 transition-transform duration-(--dur)",
          collapsed && "rotate-180",
        )}
        aria-hidden
      />
      {!collapsed && <span>Recolher</span>}
    </button>
  );

  return collapsed ? <Tooltip content={rotulo}>{botao}</Tooltip> : botao;
}
