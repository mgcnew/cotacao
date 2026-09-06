"use client";

import { Building2, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import * as React from "react";

import { CompanyAvatar } from "@/components/company/company-avatar";
import { CompanyProfileDialog } from "@/components/company/company-profile-dialog";
import { Button } from "@/components/ui/button";
import { setActiveCompany } from "@/lib/auth/actions";
import type { CompanyMembership } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

type Props = {
  companies: CompanyMembership[];
  activeCompanyId: string;
};

export function CompanySwitcher({ companies, activeCompanyId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const active =
    companies.find((company) => company.companyId === activeCompanyId) ??
    companies[0];
  const canManage = active.permissions.includes("role.manage");

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <>
      <div ref={containerRef} className="relative">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={pending}
          onClick={() => setOpen((value) => !value)}
          className="text-fg-muted h-8 gap-2 px-2 font-normal"
        >
          <CompanyAvatar
            name={active.companyName}
            logoPath={active.companyLogoPath}
          />
          <span className="max-w-40 truncate">{active.companyName}</span>
          <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
        </Button>

        {open ? (
          <div
            role="menu"
            className={cn(
              "border-border bg-surface-elevated absolute right-0 z-50 mt-1",
              "w-72 max-w-[calc(100vw-1rem)] rounded-lg border p-1 shadow-(--shadow-md)",
              "animate-ds-in",
            )}
          >
            <div className="flex items-center gap-3 px-2.5 py-2.5">
              <CompanyAvatar
                name={active.companyName}
                logoPath={active.companyLogoPath}
                className="size-9 text-xs"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-fg truncate text-sm font-medium">
                  {active.companyName}
                </strong>
                <span className="text-fg-subtle truncate text-xs">
                  {active.companyLegalName ?? active.roleName}
                </span>
              </span>
            </div>

            {companies.length > 1 ? (
              <div className="border-border border-t pt-1">
                <p className="text-fg-subtle px-2 py-1 text-[10px] font-medium tracking-wider uppercase">
                  Trocar empresa
                </p>
                {companies.map((company) => {
                  const isActive = company.companyId === active.companyId;
                  return (
                    <button
                      key={company.companyId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        if (isActive) return setOpen(false);
                        setOpen(false);
                        startTransition(async () => {
                          await setActiveCompany(company.companyId);
                        });
                      }}
                      className="hover:bg-surface-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                    >
                      <CompanyAvatar
                        name={company.companyName}
                        logoPath={company.companyLogoPath}
                      />
                      <span className="text-fg min-w-0 flex-1 truncate">
                        {company.companyName}
                      </span>
                      {isActive ? (
                        <Check
                          className="text-primary size-4 shrink-0"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="border-border mt-1 border-t pt-1">
              {canManage ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setProfileOpen(true);
                  }}
                  className="text-fg-muted hover:bg-surface-muted hover:text-fg flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
                >
                  <Settings2 className="size-4" aria-hidden />
                  Editar perfil da empresa
                </button>
              ) : (
                <p className="text-fg-subtle flex items-center gap-2 px-2.5 py-2 text-xs">
                  <Building2 className="size-4" aria-hidden />
                  Perfil gerenciado por um administrador
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {canManage && profileOpen ? (
        <CompanyProfileDialog
          key={`${active.companyId}:${active.companyLogoPath ?? "none"}`}
          company={active}
          open
          onOpenChange={setProfileOpen}
        />
      ) : null}
    </>
  );
}
