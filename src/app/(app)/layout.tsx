import { cookies } from "next/headers";
import { Suspense } from "react";

import {
  AppBreadcrumb,
  ListUrlMemory,
} from "@/components/layout/app-breadcrumb";
import { AppSidebar, SIDEBAR_COOKIE } from "@/components/layout/app-sidebar";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OperationalLiveUpdates } from "@/components/layout/operational-live-updates";
import { PwaInstallButton } from "@/components/layout/pwa-install-button";
import {
  NotificationSlot,
  NotificationSlotFallback,
} from "@/components/layout/notification-slot";
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
  const [memberships, permissions, cookieStore] = await Promise.all([
    getMemberships(),
    getPermissions(activeCompany.companyId),
    cookies(),
  ]);
  // Lido no servidor para a página já nascer com a largura certa do menu,
  // sem abrir e fechar na frente da pessoa a cada recarga.
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    /* A moldura ocupa a viewport e não cresce: quem rola é só o conteúdo.
       Antes a janela inteira rolava, e o menu e o cabeçalho subiam junto —
       o menu some justamente quando se quer trocar de tela, e o cabeçalho
       leva embora o sino e o seletor de empresa.

       `dvh` e não `vh` por causa do celular: com a barra do navegador
       aparecendo e sumindo, `100vh` é maior que a tela visível e deixa uma
       faixa cortada embaixo. */
    <div
      className="flex h-dvh min-h-dvh max-h-dvh shrink-0 overflow-hidden"
      data-slot="app-shell"
    >
      <OperationalLiveUpdates companyId={activeCompany.companyId} />
      <Suspense fallback={null}>
        <ListUrlMemory />
      </Suspense>
      <AppSidebar
        companyName={activeCompany.companyName}
        permissions={[...permissions]}
        initialCollapsed={sidebarCollapsed}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Trilha à esquerda, busca no centro, sino e conta à direita. Tema,
            instalar e Sair moram no menu da conta: são raros, e o Sair solto
            ao lado do sino convidava ao clique sem querer. */}
        <header
          data-slot="app-header"
          className="border-border bg-surface flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6"
        >
          <MobileNav
            companyName={activeCompany.companyName}
            permissions={[...permissions]}
          />
          <Suspense fallback={<div className="flex-1" />}>
            <AppBreadcrumb className="flex-1" />
          </Suspense>
          <PwaInstallButton />
          <Suspense fallback={<NotificationSlotFallback />}>
            <NotificationSlot companyId={activeCompany.companyId} />
          </Suspense>
          <CompanySwitcher
            companies={memberships}
            activeCompanyId={activeCompany.companyId}
          />
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
        {/* Coluna flex para que uma tela possa travar a lista na viewport com
            `sm:flex-1 sm:min-h-0`: o rodapé da paginação encosta no fim da
            janela e só as linhas rolam, por dentro. Quem não adere não sente
            diferença — um filho de altura natural continua se comportando
            como antes, e o `overflow-y-auto` segue valendo para o celular,
            onde a página inteira volta a rolar. O `py-6` daqui é o respiro de
            baixo; antes esse mesmo 24 estava copiado à mão no JS que media a
            tabela. */}
        <main
          data-slot="app-main"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
