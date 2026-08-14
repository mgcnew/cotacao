import { LogOut } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import {
  getMemberships,
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // requireUser redireciona para /login; requireActiveCompany para /onboarding.
  await requireUser();
  const activeCompany = await requireActiveCompany();
  const [memberships, permissions] = await Promise.all([
    getMemberships(),
    getPermissions(activeCompany.companyId),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        companyName={activeCompany.companyName}
        permissions={[...permissions]}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:gap-4 sm:px-6">
          <MobileNav
            companyName={activeCompany.companyName}
            permissions={[...permissions]}
          />
          <div className="flex-1" />
          <CompanySwitcher
            companies={memberships}
            activeCompanyId={activeCompany.companyId}
          />
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-fg-muted h-8 gap-1.5 px-2 font-normal"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sair
            </Button>
          </form>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
