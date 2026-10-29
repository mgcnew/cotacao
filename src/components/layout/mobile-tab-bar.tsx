"use client";

import Link from "next/link";

import { useVisibleNav } from "@/components/layout/nav-list";
import { cn } from "@/lib/utils";

/**
 * Barra de baixo do celular com os destinos de campo.
 *
 * No celular o trabalho é outro: conferir chegada, etiquetar, anotar o que
 * falta, falar com fornecedor. Esses quatro ficam ao alcance do polegar, sem
 * abrir a gaveta; o resto continua nela.
 *
 * Mora no fluxo da moldura (não é `fixed`): a área de conteúdo encolhe para
 * caber, então nada fica escondido atrás dela — inclusive o campo de mensagem
 * do WhatsApp, que encosta no fim da tela.
 */

const DESTINOS: Array<{ href: string; curto: string }> = [
  { href: "/lista-compras", curto: "Lista" },
  { href: "/recebimentos", curto: "Chegadas" },
  { href: "/etiquetas", curto: "Etiquetas" },
  { href: "/whatsapp", curto: "WhatsApp" },
];

export function MobileTabBar({ permissions }: { permissions: string[] }) {
  const { groups, isActive } = useVisibleNav(permissions);
  const visiveis = groups.flatMap((g) => g.items);
  const itens = DESTINOS.flatMap((destino) => {
    const item = visiveis.find((i) => i.href === destino.href);
    return item ? [{ ...item, curto: destino.curto }] : [];
  });
  if (itens.length === 0) return null;

  return (
    <nav
      aria-label="Atalhos de campo"
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
    </nav>
  );
}
