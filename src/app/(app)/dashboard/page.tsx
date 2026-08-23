import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  MessageCircle,
  MessageSquareText,
  Plus,
  Scale,
  ShoppingCart,
  TrendingDown,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AttentionList } from "@/components/dashboard/attention-list";
import { DashboardMetric } from "@/components/dashboard/dashboard-metric";
import { FirstSteps } from "@/components/dashboard/first-steps";
import { Button } from "@/components/ui/button";
import {
  CardSkeleton,
  ListSkeleton,
  MetricsSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";
import { getCompany } from "@/features/company/queries";
import { listRecentActivity } from "@/features/dashboard/activity";
import { getAttentionItems } from "@/features/dashboard/attention";
import { getMonthFinancials } from "@/features/dashboard/financial";
import {
  getFirstSteps,
  getSituationSummary,
} from "@/features/dashboard/situation";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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

export default async function DashboardPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-primary mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">
            Visão operacional
          </p>
          <h1 className="text-fg text-2xl font-semibold tracking-tight sm:text-3xl">
            Central de compras
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            {company.companyName} · {company.roleName}. Prioridades, andamento e
            resultado em um só lugar.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="text-fg-subtle flex items-center gap-2 text-xs capitalize">
            <CalendarDays className="size-4" aria-hidden />
            {TODAY.format(new Date())}
          </div>
          <div className="flex flex-wrap gap-2">
            {permissions.has("purchase_round.create") ? (
              <Button asChild size="sm">
                <Link href="/compras/nova">
                  <Plus aria-hidden /> Nova rodada
                </Link>
              </Button>
            ) : null}
            {permissions.has("order.create") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/pedidos/novo">Novo pedido</Link>
              </Button>
            ) : null}
            {permissions.has("purchase_round.view") ? (
              <Button
                asChild
                size="icon-sm"
                variant="outline"
                title="WhatsApp Compras"
              >
                <Link href="/whatsapp" aria-label="Abrir WhatsApp Compras">
                  <MessageCircle aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <Suspense
        fallback={
          <>
            <section className="mb-6">
              <SectionTitleSkeleton />
              <MetricsSkeleton />
            </section>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.75fr)]">
              <ListSkeleton rows={4} />
              <CardSkeleton lines={5} />
            </div>
          </>
        }
      >
        <Panorama companyId={company.companyId} permissions={permissions} />
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
          <Financial companyId={company.companyId} />
        </Suspense>
      ) : null}

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

      <p className="text-fg-subtle mt-5 text-right text-[11px]">
        Atualizado às {TIME.format(new Date())}
      </p>
    </div>
  );
}

async function Panorama({
  companyId,
  permissions,
}: {
  companyId: string;
  permissions: Set<string>;
}) {
  const canSeeRounds = permissions.has("purchase_round.view");
  const canSeeOrders = permissions.has("order.view");
  const [attention, situation] = await Promise.all([
    getAttentionItems(companyId, permissions),
    getSituationSummary(companyId, permissions),
  ]);
  const starting =
    situation.rondasAtivas === 0 &&
    situation.pedidosEmAberto === 0 &&
    attention.length === 0;
  const steps = starting
    ? await getFirstSteps(companyId, permissions)
    : null;

  if (steps?.length) {
    return (
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
        <FirstSteps steps={steps} />
        <div className="border-border bg-surface relative overflow-hidden rounded-2xl border p-6 shadow-xs">
          <div
            className="bg-primary/8 absolute -top-16 -right-16 size-44 rounded-full"
            aria-hidden
          />
          <ShoppingCart className="text-primary relative size-7" aria-hidden />
          <h2 className="text-fg relative mt-5 text-lg font-semibold">
            Sua operação começa aqui
          </h2>
          <p className="text-fg-muted relative mt-2 text-sm leading-relaxed">
            Depois da primeira cotação, este espaço passa a mostrar respostas,
            pedidos, atrasos e economia automaticamente.
          </p>
        </div>
      </section>
    );
  }

  const critical = attention.filter(
    (item) => item.severity === "high",
  ).length;
  const responseRate =
    situation.fornecedoresTotal > 0
      ? Math.round(
          (situation.fornecedoresResponderam / situation.fornecedoresTotal) *
            100,
        )
      : 0;

  return (
    <>
      {canSeeRounds || canSeeOrders ? (
        <section className="mb-6" aria-labelledby="dashboard-summary">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="dashboard-summary"
                className="text-fg text-base font-semibold"
              >
                Resumo executivo
              </h2>
              <p className="text-fg-muted text-xs">
                O pulso da operação neste momento.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                critical > 0
                  ? "bg-destructive-soft text-destructive"
                  : "bg-success-soft text-success"
              }`}
            >
              {critical > 0
                ? `${critical} ${critical === 1 ? "prioridade crítica" : "prioridades críticas"}`
                : "Operação sem criticidade"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canSeeRounds ? (
              <>
                <DashboardMetric
                  icon={ShoppingCart}
                  label="Rodadas em andamento"
                  value={String(situation.rondasAtivas)}
                  hint={
                    situation.rodadaUnica?.title ?? "Cotações abertas agora"
                  }
                  href={
                    situation.rodadaUnica
                      ? `/compras/${situation.rodadaUnica.id}`
                      : "/compras"
                  }
                  tone="info"
                />
                <DashboardMetric
                  icon={MessageSquareText}
                  label="Aguardando resposta"
                  value={String(situation.fornecedoresPendentes)}
                  hint={`${responseRate}% dos fornecedores já responderam`}
                  href="/compras?situacao=aguardando"
                  tone={
                    situation.fornecedoresPendentes > 0 ? "neutral" : "good"
                  }
                />
              </>
            ) : null}
            {canSeeOrders ? (
              <>
                <DashboardMetric
                  icon={ClipboardList}
                  label="Pedidos em aberto"
                  value={String(situation.pedidosEmAberto)}
                  hint="Enviados e ainda não recebidos por inteiro"
                  href="/pedidos?situacao=abertos"
                />
                <DashboardMetric
                  icon={TriangleAlert}
                  label="Pedidos atrasados"
                  value={String(situation.pedidosAtrasados)}
                  hint={
                    situation.pedidosAtrasados > 0
                      ? "Prazo vencido e mercadoria pendente"
                      : "Nenhuma entrega fora do prazo"
                  }
                  href="/pedidos?situacao=atrasados"
                  tone={situation.pedidosAtrasados > 0 ? "bad" : "good"}
                />
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.75fr)]">
        <section
          className="border-border bg-surface overflow-hidden rounded-2xl border shadow-xs"
          aria-labelledby="attention-title"
        >
          <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
            <div>
              <h2
                id="attention-title"
                className="text-fg text-base font-semibold"
              >
                Prioridades de hoje
              </h2>
              <p className="text-fg-muted mt-0.5 text-xs">
                Ordenadas por urgência e prontas para ação.
              </p>
            </div>
            {attention.length ? (
              <span className="bg-surface-muted text-fg-muted grid min-w-7 place-items-center rounded-full px-2 text-xs font-semibold leading-7">
                {attention.length}
              </span>
            ) : null}
          </header>
          <AttentionList items={attention} />
        </section>

        {canSeeRounds || canSeeOrders ? (
          <aside
            className="border-border bg-surface rounded-2xl border p-5 shadow-xs"
            aria-labelledby="flow-title"
          >
            <h2 id="flow-title" className="text-fg text-base font-semibold">
              Fluxo da operação
            </h2>
            <p className="text-fg-muted mt-0.5 text-xs">
              Leitura rápida do trabalho em curso.
            </p>

            {canSeeRounds ? (
              <div className="mt-5">
                <div className="flex items-end justify-between gap-3 text-xs">
                  <span className="text-fg-muted">Respostas das cotações</span>
                  <strong className="text-fg tabular-nums">
                    {situation.fornecedoresResponderam}/
                    {situation.fornecedoresTotal}
                  </strong>
                </div>
                <div className="bg-surface-muted mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width]"
                    style={{ width: `${responseRate}%` }}
                  />
                </div>
                <p className="text-fg-subtle mt-1.5 text-[11px]">
                  {responseRate}% concluído nas rodadas ativas
                </p>
              </div>
            ) : null}

            <div className="border-border mt-5 divide-y border-y">
              {canSeeRounds ? (
                <Link
                  href="/compras"
                  className="hover:text-primary flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-fg-muted">Rodadas ativas</span>
                  <strong className="text-fg tabular-nums">
                    {situation.rondasAtivas}
                  </strong>
                </Link>
              ) : null}
              {canSeeOrders ? (
                <Link
                  href="/pedidos?situacao=abertos"
                  className="hover:text-primary flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-fg-muted">Pedidos em aberto</span>
                  <strong className="text-fg tabular-nums">
                    {situation.pedidosEmAberto}
                  </strong>
                </Link>
              ) : null}
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-fg-muted">Ações pendentes</span>
                <strong className="text-fg tabular-nums">
                  {attention.length}
                </strong>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

async function Financial({ companyId }: { companyId: string }) {
  const company = await getCompany(companyId);
  if (!company) return null;
  const financial = await getMonthFinancials(companyId, company.timezone);

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
            Valores realizados a partir das mercadorias recebidas.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/analises">Ver análise completa</Link>
        </Button>
      </header>

      {financial.itensRecebidos === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <WalletCards className="text-fg-subtle size-5" aria-hidden />
          <p className="text-fg-muted text-sm">
            Os resultados aparecem depois da primeira entrada de mercadoria do
            mês.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetric
            icon={WalletCards}
            label="Total comprado"
            value={MONEY.format(financial.totalComprado)}
            hint={`${financial.itensRecebidos} ${financial.itensRecebidos === 1 ? "item recebido" : "itens recebidos"}`}
          />
          <DashboardMetric
            icon={TrendingDown}
            label="Economia negociada"
            value={MONEY.format(financial.economiaNegociada)}
            hint="Diferença entre cotado e combinado"
            tone={financial.economiaNegociada > 0 ? "good" : "neutral"}
          />
          <DashboardMetric
            icon={BadgeDollarSign}
            label="Economia realizada"
            value={MONEY.format(financial.economiaRealizada)}
            hint="Diferença entre cotado e preço da nota"
            tone={
              financial.economiaRealizada > 0
                ? "good"
                : financial.economiaRealizada < 0
                  ? "bad"
                  : "neutral"
            }
          />
          <DashboardMetric
            icon={Scale}
            label="Impacto de divergências"
            value={MONEY.format(financial.impactoDivergencias)}
            hint="Valor cobrado além do combinado"
            tone={financial.impactoDivergencias > 0 ? "bad" : "good"}
          />
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
