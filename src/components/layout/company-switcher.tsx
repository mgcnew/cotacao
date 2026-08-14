"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { setActiveCompany } from "@/lib/auth/actions";
import type { CompanyMembership } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

type Props = {
  companies: CompanyMembership[];
  activeCompanyId: string;
};

export function CompanySwitcher({ companies, activeCompanyId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const active =
    companies.find((c) => c.companyId === activeCompanyId) ?? companies[0];

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Com uma empresa só, o seletor vira rótulo — não há o que escolher.
  if (companies.length <= 1) {
    return (
      <div className="text-fg-muted flex items-center gap-2 text-sm">
        <span className="bg-surface-muted text-fg-muted grid size-6 place-items-center rounded-sm text-[10px] font-semibold">
          {initials(active.companyName)}
        </span>
        <span className="max-w-40 truncate">{active.companyName}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="text-fg-muted h-8 gap-2 px-2 font-normal"
      >
        <span className="bg-surface-muted text-fg-muted grid size-6 place-items-center rounded-sm text-[10px] font-semibold">
          {initials(active.companyName)}
        </span>
        <span className="max-w-40 truncate">{active.companyName}</span>
        <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
      </Button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "border-border bg-surface-elevated absolute right-0 z-50 mt-1",
            "min-w-56 rounded-lg border p-1 shadow-(--shadow-md)",
            "animate-ds-in",
          )}
        >
          {companies.map((company) => {
            const isActive = company.companyId === active.companyId;
            return (
              <button
                key={company.companyId}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setOpen(false);
                  startTransition(async () => {
                    await setActiveCompany(company.companyId);
                  });
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  "hover:bg-surface-muted transition-colors duration-(--dur)",
                )}
              >
                <span className="bg-surface-muted text-fg-muted grid size-6 shrink-0 place-items-center rounded-sm text-[10px] font-semibold">
                  {initials(company.companyName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-fg truncate">
                    {company.companyName}
                  </span>
                  <span className="text-fg-subtle truncate text-xs">
                    {company.roleName}
                  </span>
                </span>
                {isActive ? (
                  <Check className="text-primary size-4 shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
