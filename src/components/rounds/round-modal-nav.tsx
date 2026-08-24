"use client";

import { ClipboardCheck, PackageSearch, Send, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  {
    key: "responses",
    label: "Respostas",
    mobileLabel: "Respostas",
    icon: Send,
  },
  {
    key: "distribution",
    label: "Distribuição",
    mobileLabel: "Distribuir",
    icon: UsersRound,
  },
  {
    key: "scope",
    label: "Produtos e grupos",
    mobileLabel: "Produtos",
    icon: PackageSearch,
  },
  {
    key: "decision",
    label: "Decisão",
    mobileLabel: "Decisão",
    icon: ClipboardCheck,
  },
] as const;

export function RoundModalNav({ roundId }: { roundId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inDecision =
    pathname.endsWith("/comparacao") || pathname.endsWith("/alocacao");
  const requested = searchParams.get("view");
  const current = inDecision
    ? "decision"
    : requested === "distribution" || requested === "scope"
      ? requested
      : "responses";

  return (
    <nav
      className="border-border shrink-0 overflow-hidden border-b px-2 sm:overflow-x-auto sm:px-4"
      aria-label="Áreas da rodada"
    >
      <div className="grid w-full grid-cols-4 sm:flex sm:min-w-max sm:gap-1">
        {tabs.map(({ key, label, mobileLabel, icon: Icon }) => {
          const href =
            key === "responses"
              ? `/compras/${roundId}`
              : key === "decision"
                ? `/compras/${roundId}/comparacao`
                : `/compras/${roundId}?view=${key}`;
          const active = current === key;
          return (
            <Link
              key={key}
              href={href}
              replace
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-fg-muted hover:text-fg relative flex h-11 min-w-0 items-center justify-center gap-1 px-1 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm",
                active &&
                  "text-fg after:bg-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="truncate sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
