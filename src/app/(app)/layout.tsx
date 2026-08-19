import { LogOut } from "lucide-react";
import { Suspense } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import {
  NotificationSlot,
  NotificationSlotFallback,
} from "@/components/layout/notification-slot";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import {
  getMemberships,
  getPermissions,
  requireActiveCompany,
  requireUser,
} from "@/lib/auth/dal";

/**
 * A moldura do app: menu, cabeçalho e o lugar onde a página entra.
 *
 * O layout é o gargalo de tudo — nenhuma casca de página aparece antes dele
 * resolver, e ele é re-renderizado em cada prefetch que o Next dispara. Por
 * isso só espera aqui o que decide o QUE MOSTRAR: quem é a pessoa, em que
 * empresa está e o que pode ver. É uma ida ao banco (`rpc_session_context`), e
 * as três chamadas abaixo compartilham o resultado pelo `cache()` do React.
 *
 * O sino ficou de fora, atrás de um `Suspense`: ele é informação, não estrutura.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // requireUser redireciona para /login; requireActiveCompany para /onboarding.
  await requireUser();
  const activeCompany = await requireActiveCompany();
  const [memberships, permissions] = await Promise.all([
    getMemberships(),
    getPermissions(activeCompany.companyId),
  ]);

  return (
    /* A moldura ocupa a viewport e não cresce: quem rola é só o conteúdo.
       Antes a janela inteira rolava, e o menu e o cabeçalho subiam junto —
       o menu some justamente quando se quer trocar de tela, e o cabeçalho
       leva embora o sino e o seletor de empresa.

       `dvh` e não `vh` por causa do celular: com a barra do navegador
       aparecendo e sumindo, `100vh` é maior que a tela visível e deixa uma
       faixa cortada embaixo. */
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar
        companyName={activeCompany.companyName}
        permissions={[...permissions]}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:gap-4 sm:px-6">
          <MobileNav
            companyName={activeCompany.companyName}
            permissions={[...permissions]}
          />
          <div className="flex-1" />
          <Suspense fallback={<NotificationSlotFallback />}>
            <NotificationSlot companyId={activeCompany.companyId} />
          </Suspense>
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

        {/* 24px dos lados no desktop, 16px no celular — e é AQUI que a margem
            mora, não em cada página. Toda tela usa a largura que sobra, sem
            `max-w-*` própria: uma coluna estreita encostada à esquerda deixava
            24px de um lado e quase 500px do outro, e a folga desigual lia como
            defeito de alinhamento.

            O limite de leitura, onde é preciso, mora no campo e não na página:
            os formulários põem os campos em grade (`sm:grid-cols-2`,
            `lg:grid-cols-3`) para que nenhum deles fique sozinho esticado de
            ponta a ponta. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
