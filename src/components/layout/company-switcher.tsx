"use client";

import {
  Building2,
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { CompanyAvatar } from "@/components/company/company-avatar";
import { CompanyProfileDialog } from "@/components/company/company-profile-dialog";
import {
  ACCENTS,
  type Accent,
  useAccent,
} from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { setActiveCompany, signOut } from "@/lib/auth/actions";
import type { CompanyMembership } from "@/lib/auth/dal";
import { definirSom, useSomLigado } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

const TEMAS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

const NOMES_DAS_CORES: Record<Accent, string> = {
  indigo: "Índigo",
  blue: "Azul",
  purple: "Roxo",
  green: "Verde",
  orange: "Laranja",
  red: "Vermelho",
  ocean: "Oceano",
  safira: "Safira",
  nevoa: "Névoa",
};

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
  // O menu só abre depois da hidratação, então aqui o tema já é o do cliente.
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const somLigado = useSomLigado();

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
          <span className="hidden max-w-40 truncate sm:inline">
            {active.companyName}
          </span>
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
                <p className="text-fg-subtle px-2 py-1 text-xs font-medium">
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

            {/* Aparência, som e saída: raras, por isso dentro do menu e não soltas
                no cabeçalho. Trocar tema ou cor não fecha o menu: a pessoa vê
                o resultado na hora e pode experimentar outra. */}
            <div className="border-border mt-1 flex flex-col gap-2.5 border-t px-2.5 pt-2.5 pb-2">
              <div className="flex flex-col gap-1.5">
                <span
                  id="menu-tema"
                  className="text-fg-subtle text-xs font-medium"
                >
                  Tema
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="menu-tema"
                  className="border-border bg-surface-sunken grid grid-cols-3 gap-0.5 rounded-md border p-0.5"
                >
                  {TEMAS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={theme === value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "text-fg-muted hover:text-fg flex h-7 items-center justify-center gap-1.5 rounded-[5px] text-xs transition-colors",
                        theme === value &&
                          "bg-surface text-fg font-medium shadow-xs",
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span
                  id="menu-cor"
                  className="text-fg-subtle text-xs font-medium"
                >
                  Cor de destaque
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="menu-cor"
                  className="flex gap-2 px-0.5 py-0.5"
                >
                  {ACCENTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={accent === value}
                      aria-label={NOMES_DAS_CORES[value]}
                      title={NOMES_DAS_CORES[value]}
                      onClick={() => setAccent(value)}
                      data-accent={value}
                      className={cn(
                        "bg-primary size-5 rounded-full transition-[box-shadow] duration-(--dur) ease-(--ease)",
                        // Tema inteiro, não só accent: a bolinha mostra os dois polos.
                        value === "ocean" &&
                          "bg-[linear-gradient(135deg,var(--primary)_50%,var(--brand)_50%)]",
                        // Preto e branco: no escuro o accent vira claro, e a
                        // bolinha mostra as duas pontas para não sumir.
                        value === "nevoa" &&
                          "bg-[linear-gradient(135deg,#16171b_50%,#e4e5ea_50%)]",
                        accent === value
                          ? "ring-primary ring-offset-surface-elevated ring-2 ring-offset-2"
                          : "hover:ring-border-strong hover:ring-offset-surface-elevated hover:ring-2 hover:ring-offset-2",
                      )}
                    />
                  ))}
                </div>
              </div>
              {/* Ligar toca o aviso uma vez: a pessoa ouve como é e o clique
                  já libera o áudio no navegador. */}
              <button
                type="button"
                role="switch"
                aria-checked={somLigado}
                onClick={() => definirSom(!somLigado)}
                className="text-fg-muted hover:text-fg -mx-1 flex items-center gap-2 rounded-md px-1 py-1 text-left text-xs transition-colors pointer-coarse:min-h-11"
              >
                {somLigado ? (
                  <Volume2 className="size-3.5" aria-hidden />
                ) : (
                  <VolumeX className="size-3.5" aria-hidden />
                )}
                <span className="flex-1">Som das notificações</span>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-(--dur) ease-(--ease)",
                    somLigado ? "bg-primary-solid" : "bg-border-strong",
                  )}
                >
                  <span
                    className={cn(
                      "bg-surface absolute top-0.5 left-0.5 size-3 rounded-full shadow-xs transition-transform duration-(--dur) ease-(--ease)",
                      somLigado && "translate-x-3",
                    )}
                  />
                </span>
              </button>
            </div>

            <div className="border-border border-t pt-1">
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="text-fg-muted hover:bg-surface-muted hover:text-fg flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
                >
                  <LogOut className="size-4" aria-hidden />
                  Sair
                </button>
              </form>
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
