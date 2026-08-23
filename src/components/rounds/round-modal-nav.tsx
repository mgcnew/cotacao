"use client";

import { ClipboardCheck, PackageSearch, Send, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { key: "responses", label: "Respostas", icon: Send },
  { key: "distribution", label: "Distribuição", icon: UsersRound },
  { key: "scope", label: "Produtos e grupos", icon: PackageSearch },
  { key: "decision", label: "Decisão", icon: ClipboardCheck },
] as const;

export function RoundModalNav({ roundId }: { roundId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inDecision = pathname.endsWith("/comparacao") || pathname.endsWith("/alocacao");
  const requested = searchParams.get("view");
  const current = inDecision
    ? "decision"
    : requested === "distribution" || requested === "scope"
      ? requested
      : "responses";

  return (
    <nav className="border-border shrink-0 overflow-x-auto border-b px-4" aria-label="Áreas da rodada">
      <div className="flex min-w-max gap-1">
        {tabs.map(({ key, label, icon: Icon }) => {
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
                "text-fg-muted hover:text-fg relative flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                active && "text-fg after:bg-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
