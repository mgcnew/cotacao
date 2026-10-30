"use client";

import { Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { CotaProMark } from "@/components/brand/cotapro-logo";
import { useVisibleNav } from "@/components/layout/nav-list";
import { cn } from "@/lib/utils";

/**
 * Barra de baixo do celular: os três destinos do dia a dia e o "Mais".
 *
 * Central, Compras e Pedidos são o ciclo do comprador e ficam a um toque. O
 * resto — lista, recebimentos, produtos, fornecedores, WhatsApp, etiquetas,
 * análises, anotações e configurações — mora na folha do "Mais", com os mesmos
 * itens e a mesma ordem da sidebar do desktop. Não há menu hambúrguer: um só lugar
 * para navegar, ao alcance do polegar.
 *
 * Mora no fluxo da moldura (não é `fixed`): a área de conteúdo encolhe para
 * caber, então nada fica escondido atrás dela — inclusive o campo de mensagem
 * do WhatsApp, que encosta no fim da tela.
 *
 * A folha é um diálogo do Radix: prende o foco, fecha com Esc e ao tocar fora,
 * deixa a página inerte para o leitor de tela e devolve o foco ao "Mais". Fecha
 * ao escolher um item (`onClick`), e não por efeito na mudança de rota.
 */

const DESTINOS: Array<{ href: string; curto: string }> = [
  { href: "/dashboard", curto: "Central" },
  { href: "/compras", curto: "Compras" },
  { href: "/pedidos", curto: "Pedidos" },
];

const NA_BARRA = new Set(DESTINOS.map((destino) => destino.href));

export function MobileTabBar({
  permissions,
  companyName,
}: {
  permissions: string[];
  companyName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { groups, footer, isActive } = useVisibleNav(permissions);

  const visiveis = groups.flatMap((group) => group.items);
  const itens = DESTINOS.flatMap((destino) => {
    const item = visiveis.find((candidate) => candidate.href === destino.href);
    return item ? [{ ...item, curto: destino.curto }] : [];
  });

  // O que não cabe na barra, na ordem do menu do desktop (operação, catálogo,
  // gestão). Poucos itens: uma grade só cabe sem rolar, e títulos de grupo
  // custavam mais altura do que ajudavam.
  const restantes = [
    ...groups
      .flatMap((group) => group.items)
      .filter((item) => !NA_BARRA.has(item.href) && !item.desktopOnly),
    ...footer,
  ];
  // "Mais" acende quando a tela atual mora nele: sem isso, quem está em
  // Recebimentos não vê onde está.
  const maisAtivo = restantes.some((item) => isActive(item.href));

  const close = () => setOpen(false);

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border bg-surface flex shrink-0 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {itens.map((item) => {
        const ativo = isActive(item.href);
        const Icone = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              ativo ? "text-primary" : "text-fg-muted active:text-fg",
            )}
          >
            <Icone className="size-5" aria-hidden />
            {item.curto}
          </Link>
        );
      })}

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            data-active={maisAtivo || undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              maisAtivo || open ? "text-primary" : "text-fg-muted active:text-fg",
            )}
          >
            <Ellipsis className="size-5" aria-hidden />
            Mais
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-ds-fade data-[state=closed]:animate-ds-fade-out fixed inset-0 z-50 bg-black/40 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="bg-surface border-border data-[state=open]:animate-ds-sheet-in data-[state=closed]:animate-ds-sheet-out fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-xl outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Mais</DialogPrimitive.Title>
            <div aria-hidden className="bg-border-strong mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />
            <div className="flex shrink-0 items-center gap-2.5 px-4 pt-2 pb-1">
              <CotaProMark className="size-7" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-fg text-sm font-semibold tracking-tight">
                  Cota<span className="text-brand">Pro</span>
                </span>
                <span className="text-fg-subtle truncate text-xs">{companyName}</span>
              </span>
              <DialogPrimitive.Close
                aria-label="Fechar"
                className="text-fg-muted hover:bg-surface-muted hover:text-fg grid size-11 place-items-center rounded-md"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              <div className="mt-2 grid grid-cols-3 gap-2">
                {restantes
                  .filter((item) => !footer.includes(item))
                  .map((item) => (
                    <Tile
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.href)}
                      onNavigate={close}
                    />
                  ))}
              </div>
              <div className="border-border mt-3 border-t pt-2">
                {footer.map((item) => {
                  const Icone = item.icon;
                  const ativo = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      aria-current={ativo ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                        ativo
                          ? "bg-primary-soft text-primary"
                          : "text-fg hover:bg-surface-muted active:bg-surface-muted",
                      )}
                    >
                      <Icone className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </nav>
  );
}

function Tile({
  href,
  label,
  icon: Icone,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-colors",
        active
          ? "border-primary-line bg-primary-soft text-primary"
          : "border-border bg-surface text-fg active:bg-surface-muted",
      )}
    >
      <Icone className={cn("size-5", active ? "text-primary" : "text-fg-muted")} aria-hidden />
      <span className="line-clamp-2 text-xs leading-tight font-medium">{label}</span>
    </Link>
  );
}
