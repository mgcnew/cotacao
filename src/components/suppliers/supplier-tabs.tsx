"use client";

import { Bell, CalendarClock, History, IdCard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "cadastro", label: "Cadastro", short: "Cadastro", icon: IdCard },
  { key: "contatos", label: "Contatos", short: "Contatos", icon: Users },
  {
    key: "agenda",
    label: "Modelo de compra",
    short: "Modelo",
    icon: CalendarClock,
  },
  { key: "avisos", label: "Avisos", short: "Avisos", icon: Bell },
  {
    key: "historico",
    label: "Histórico comercial",
    short: "Histórico",
    icon: History,
  },
] as const;

/**
 * A faixa que diz em que área do fornecedor você está.
 *
 * Serve à página inteira e ao modal. No modal ela mora no `layout.tsx`, junto
 * com o cabeçalho, e por isso não remonta ao trocar de aba — o que troca é só
 * o miolo abaixo dela.
 *
 * `replace` de propósito: as abas não são passos de uma navegação, e empilhar
 * cada troca faria o "voltar" percorrer a visita inteira antes de fechar o
 * modal ou sair da tela.
 */
export function SupplierTabs({ supplierId }: { supplierId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const noHistorico = pathname.endsWith("/historico");
  const requested = searchParams.get("aba");
  const current = noHistorico ? "historico" : (requested ?? "cadastro");

  return (
    <nav
      className="border-border shrink-0 overflow-x-auto border-b px-2 sm:px-4"
      aria-label="Áreas do fornecedor"
    >
      <div className="flex min-w-max gap-0.5 sm:gap-1">
        {TABS.map(({ key, label, short, icon: Icon }) => {
          const href =
            key === "historico"
              ? `/fornecedores/${supplierId}/historico`
              : key === "cadastro"
                ? `/fornecedores/${supplierId}`
                : `/fornecedores/${supplierId}?aba=${key}`;
          const active = current === key;
          return (
            <Link
              key={key}
              href={href}
              replace
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-fg-muted hover:text-fg relative flex h-11 items-center justify-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
                active &&
                  "text-fg after:bg-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
