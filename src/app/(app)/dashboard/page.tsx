import {
  CalendarDays,
  MessageCircle,
  PackageCheck,
  ShoppingCart,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { cache, Suspense } from "react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardMetric } from "@/components/dashboard/dashboard-metric";
import { FinancialJourneyMetric } from "@/components/dashboard/financial-journey-metric";
import { FirstSteps } from "@/components/dashboard/first-steps";
import { PrioritiesCard } from "@/components/dashboard/priorities-card";
import {
  StatusStrip,
  type StatusItem,
} from "@/components/dashboard/status-strip";
import { SuggestionsDisclosure } from "@/components/dashboard/suggestions-disclosure";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  ListSkeleton,
  MetricsSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";
import { listRecentActivity } from "@/features/dashboard/activity";
import { getAttentionItems } from "@/features/dashboard/attention";
import { getMonthFinancials } from "@/features/dashboard/financial";
import {
  getFirstSteps,
  getSituationSummary,
} from "@/features/dashboard/situation";
import { listPurchaseSuggestions } from "@/features/shopping-list/suggestions";
import { listDetectedPurchasePatterns } from "@/features/suppliers/purchase-patterns";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { listPurchaseScheduleAlerts } from "@/features/suppliers/schedules";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const MONTH = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const TODAY = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});
const TIME = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Tudo o que o painel de hoje precisa, lido uma vez.
 *
 * "Prioridades" e "Sugestões" são dois blocos em dois lugares da página — o
 * financeiro fica entre eles —, mas saem das MESMAS consultas. Com `cache()`
 * elas rodam uma vez por renderização, e cada bloco espera dentro do seu
 * `<Suspense>` sem repetir a viagem ao banco.
 */
const carregarPainel = cache(
  async (companyId: string, permissions: Set<string>) => {
    const canSeeRounds = permissions.has("purchase_round.view");
    const canSeeOrders = permissions.has("order.view");
    const [
      attention,
      situation,
      purchaseAlerts,
      purchaseSuggestions,
      detectedPatterns,
    ] = await Promise.all([
      getAttentionItems(companyId, permissions),
      getSituationSummary(companyId, permissions),
      canSeeRounds || canSeeOrders
        ? listPurchaseScheduleAlerts(companyId)
        : Promise.resolve([]),
      permissions.has("product.view")
        ? listPurchaseSuggestions(companyId)
        : Promise.resolve([]),
      permissions.has("supplier.update")
        ? listDetectedPurchasePatterns(companyId)
        : Promise.resolve([]),
    ]);
    const starting =
      situation.rondasAtivas === 0 &&
      situation.pedidosEmAberto === 0 &&
      attention.length === 0 &&
      purchaseAlerts.length === 0 &&
      purchaseSuggestions.length === 0 &&
      detectedPatterns.length === 0;
    const steps = starting ? await getFirstSteps(companyId, permissions) : null;

    return {
      attention,
      situation,
      purchaseAlerts,
      purchaseSuggestions,
      detectedPatterns,
      steps,
    };
  },
);

export default async function DashboardPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-fg text-2xl font-semibold tracking-tight sm:text-3xl">
            Central de compras
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            {company.companyName} · {company.roleName}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="text-fg-muted flex items-center gap-2 text-xs">
            <CalendarDays className="size-4" aria-hidden />
            {/* Só a inicial maiúscula: `capitalize` escrevia "27 De Outubro". O
                `span` é o que faz `first-letter` valer — num contêiner flex
                ele é ignorado. */}
            <span className="first-letter:uppercase">
              {TODAY.format(new Date())}
            </span>
          </div>
          {permissions.has("purchase_round.view") ? (
            // Com nome e em qualquer tela: é a ferramenta mais usada do dia a
            // dia, e some justamente no celular, onde o WhatsApp mora.
            <Button asChild size="sm" variant="outline">
              <Link href="/whatsapp">
                <MessageCircle aria-hidden /> WhatsApp
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <Suspense
        fallback={
          <>
            <div className="mb-5 flex gap-8">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="mb-6">
              <ListSkeleton rows={4} />
            </div>
          </>
        }
      >
        <Prioridades company={company} permissions={permissions} />
      </Suspense>

      {permissions.has("analytics.view") ? (
        <Suspense
          fallback={
            <section className="mt-6">
              <SectionTitleSkeleton />
              <MetricsSkeleton />
            </section>
          }
        >
          <Financial
            companyId={company.companyId}
            timezone={company.companyTimezone}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <Sugestoes companyId={company.companyId} permissions={permissions} />
      </Suspense>

      <Suspense
        fallback={
          <section className="mt-6">
            <SectionTitleSkeleton />
            <CardSkeleton lines={5} />
          </section>
        }
      >
        <RecentActivity companyId={company.companyId} />
      </Suspense>

      <p className="text-fg-muted mt-5 text-right text-xs">
        Atualizado às {TIME.format(new Date())}
      </p>
    </div>
  );
}

/**
 * A primeira coisa da tela: o que está em curso e o que pede ação hoje.
 *
 * Empresa que ainda não comprou nada vê os primeiros passos, não uma tela de
 * zeros.
 */
async function Prioridades({
  company,
  permissions,
}: {
  company: Awaited<ReturnType<typeof requireActiveCompany>>;
  permissions: Set<string>;
}) {
  const painel = await carregarPainel(company.companyId, permissions);
  const { attention, situation, purchaseAlerts, steps } = painel;

  if (steps?.length) {
    return (
      <section className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
        <FirstSteps steps={steps} />
        <div className="border-border bg-surface rounded-2xl border p-6 shadow-xs">
          <ShoppingCart className="text-primary size-7" aria-hidden />
          <h2 className="text-fg mt-5 text-base font-semibold">
            Sua operação começa aqui
          </h2>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            Depois da primeira cotação, este espaço passa a mostrar respostas,
            pedidos, atrasos e economia automaticamente.
          </p>
        </div>
      </section>
    );
  }

  const canSeeRounds = permissions.has("purchase_round.view");
  const canSeeOrders = permissions.has("order.view");
  const statusItems: StatusItem[] = [
    ...(canSeeRounds
      ? [
          {
            label: "Rodadas em andamento",
            value: String(situation.rondasAtivas),
            href: situation.rodadaUnica
              ? `/compras/${situation.rodadaUnica.id}`
              : "/compras",
          },
        ]
      : []),
    ...(canSeeOrders
      ? [
          {
            label: "Pedidos em aberto",
            value: String(situation.pedidosEmAberto),
            href: "/pedidos?situacao=abertos",
          },
        ]
      : []),
    ...(canSeeRounds && situation.fornecedoresTotal > 0
      ? [
          {
            label: "Fornecedores que responderam",
            value: `${situation.fornecedoresResponderam}/${situation.fornecedoresTotal}`,
            href: "/compras?situacao=aguardando",
          },
        ]
      : []),
  ];

  return (
    <>
      <StatusStrip items={statusItems} />
      <PrioritiesCard
        attention={attention}
        due={purchaseAlerts.filter((alert) => alert.status !== "upcoming")}
        canCreateRound={permissions.has("purchase_round.create")}
        canCreateOrder={permissions.has("order.create")}
        canManageSchedule={permissions.has("supplier.update")}
      />
    </>
  );
}

/** O planejamento: recolhido, no fim, para não ficar entre o dia e o resultado. */
async function Sugestoes({
  companyId,
  permissions,
}: {
  companyId: string;
  permissions: Set<string>;
}) {
  const painel = await carregarPainel(companyId, permissions);
  if (painel.steps?.length) return null;

  return (
    <SuggestionsDisclosure
      upcoming={painel.purchaseAlerts.filter(
        (alert) => alert.status === "upcoming",
      )}
      replenishments={painel.purchaseSuggestions}
      patterns={painel.detectedPatterns}
      canCreateRound={permissions.has("purchase_round.create")}
      canCreateOrder={permissions.has("order.create")}
      canManageSchedule={permissions.has("supplier.update")}
    />
  );
}

async function Financial({
  companyId,
  timezone,
}: {
  companyId: string;
  timezone: string;
}) {
  // O fuso já vem com a sessão: perguntar de novo à tabela de empresas custava
  // uma ida ao banco EM SÉRIE antes de o financeiro poder começar.
  const financial = await getMonthFinancials(companyId, timezone);

  return (
    <section
      className="border-border bg-surface mt-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="financial-title"
    >
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="financial-title"
            className="text-fg text-base font-semibold capitalize"
          >
            Resultado de {MONTH.format(new Date(`${financial.de}T12:00:00`))}
          </h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            Planejado ao concluir as cotações e realizado ao conferir as
            mercadorias.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/analises">Ver análise completa</Link>
        </Button>
      </header>

      {financial.itensRecebidos === 0 && financial.cotacoesConcluidas === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <WalletCards className="text-fg-subtle size-5" aria-hidden />
          <p className="text-fg-muted text-sm">
            Os resultados aparecem ao concluir uma cotação ou conferir a
            primeira entrada de mercadoria do mês.
          </p>
        </div>
      ) : (
        <div>
          <div className="p-4 sm:p-5">
            <div className="mb-3">
              <h3 className="text-fg text-sm font-semibold">
                Cotações concluídas no mês
              </h3>
              <p className="text-fg-muted mt-0.5 text-xs">
                Previsão congelada no encerramento de{" "}
                {financial.cotacoesConcluidas}{" "}
                {financial.cotacoesConcluidas === 1 ? "cotação" : "cotações"}.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DashboardMetric
                icon={TrendingDown}
                label="Resultado estimado das negociações"
                value={MONEY.format(financial.economiaEstimada)}
                hint="Proposta original menos preço final dos pedidos gerados"
                tone={
                  financial.economiaEstimada > 0
                    ? "good"
                    : financial.economiaEstimada < 0
                      ? "bad"
                      : "neutral"
                }
              />
              <DashboardMetric
                icon={ShoppingCart}
                label="Valor previsto dos pedidos"
                value={MONEY.format(financial.valorPrevistoPedidos)}
                hint="Preço final × quantidade estimada na decisão de compra"
              />
              <DashboardMetric
                icon={PackageCheck}
                label="Ganho estimado nas embalagens"
                value={MONEY.format(
                  financial.economiaEscolhaEmbalagensEstimada,
                )}
                hint="Custo por unidade do vencedor contra a melhor alternativa"
                tone={
                  financial.economiaEscolhaEmbalagensEstimada > 0
                    ? "good"
                    : financial.economiaEscolhaEmbalagensEstimada < 0
                      ? "bad"
                      : "neutral"
                }
              />
            </div>
          </div>

          <div className="border-border border-t p-4 sm:p-5">
            <div className="mb-3">
              <h3 className="text-fg text-sm font-semibold">
                Recebimentos conferidos no mês
              </h3>
              <p className="text-fg-muted mt-0.5 text-xs">
                Valores efetivos de {financial.itensRecebidos}{" "}
                {financial.itensRecebidos === 1
                  ? "item recebido"
                  : "itens recebidos"}
                .
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardMetric
                icon={WalletCards}
                label="Valor efetivamente recebido"
                value={MONEY.format(financial.valorRecebido)}
                hint="Preço conferido na nota × quantidade recebida"
              />
              <FinancialJourneyMetric
                metric="realized"
                value={financial.economiaRealizada}
                de={financial.de}
                ate={financial.ate}
                timezone={timezone}
                tone={
                  financial.economiaRealizada > 0
                    ? "good"
                    : financial.economiaRealizada < 0
                      ? "bad"
                      : "neutral"
                }
              />
              <DashboardMetric
                icon={PackageCheck}
                label="Ganho realizado nas embalagens"
                value={MONEY.format(
                  financial.economiaEscolhaEmbalagensRealizada,
                )}
                hint="Vantagem proporcional às embalagens efetivamente recebidas"
                tone={
                  financial.economiaEscolhaEmbalagensRealizada > 0
                    ? "good"
                    : financial.economiaEscolhaEmbalagensRealizada < 0
                      ? "bad"
                      : "neutral"
                }
              />
              <FinancialJourneyMetric
                metric="divergence"
                value={financial.impactoDivergencias}
                de={financial.de}
                ate={financial.ate}
                timezone={timezone}
                tone={
                  financial.impactoDivergencias > 0
                    ? "bad"
                    : financial.impactoDivergencias < 0
                      ? "good"
                      : "neutral"
                }
              />
            </div>
          </div>
          <div className="border-border text-fg-muted mx-4 mb-4 rounded-xl border border-dashed px-3 py-2.5 text-xs leading-relaxed">
            <strong className="text-fg">Como ler:</strong> resultado positivo é
            economia; resultado negativo significa que o preço terminou acima da
            proposta inicial. A previsão considera as cotações encerradas no
            mês. O realizado considera apenas o que já chegou. Pedidos diretos
            entram no valor recebido, mas não geram economia contra cotação. O
            ganho de embalagens é separado e considera exclusivamente produtos
            com finalidade Embalagem.
          </div>
        </div>
      )}
    </section>
  );
}

async function RecentActivity({ companyId }: { companyId: string }) {
  const activity = await listRecentActivity(companyId);
  if (activity.length === 0) return null;

  return (
    <section
      className="border-border bg-surface mt-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="activity-title"
    >
      <header className="border-border border-b px-4 py-4 sm:px-5">
        <h2 id="activity-title" className="text-fg text-base font-semibold">
          Movimentações recentes
        </h2>
        <p className="text-fg-muted mt-0.5 text-xs">
          O histórico mais recente da operação e dos fornecedores.
        </p>
      </header>
      <ActivityFeed entries={activity} />
    </section>
  );
}
