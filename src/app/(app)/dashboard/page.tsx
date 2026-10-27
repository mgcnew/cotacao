import {
  CalendarDays,
  ChevronRight,
  MessageCircle,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { cache, Suspense } from "react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FinancialJourneyMetric } from "@/components/dashboard/financial-journey-metric";
import { FirstSteps } from "@/components/dashboard/first-steps";
import { SectionError } from "@/components/dashboard/section-error";
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
/**
 * Falha de UM bloco não derruba a página.
 *
 * Os blocos do painel são independentes e cada um espera dentro do seu
 * `<Suspense>`. Um `throw` ali, porém, sobe até a raiz e troca a página inteira
 * — e o bloco que falhava podia ser a atividade recente, que é o que menos
 * importa, levando junto a lista de prioridades, que é o que mais importa.
 *
 * Os erros de controle de fluxo do Next (redirecionar, 404) têm de passar
 * adiante: são eles que fazem a navegação funcionar.
 */
function erroDeFluxoDoNext(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null || !("digest" in erro)) {
    return false;
  }
  const digest = (erro as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")
  );
}

async function protegida(
  nome: string,
  renderizar: () => Promise<React.ReactNode>,
): Promise<React.ReactNode> {
  try {
    return await renderizar();
  } catch (erro) {
    if (erroDeFluxoDoNext(erro)) throw erro;
    console.error(`[dashboard] ${nome}:`, erro);
    return <SectionError nome={nome} />;
  }
}

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
  // Data e hora no fuso DA EMPRESA. Sem `timeZone`, este Server Component usava
  // o do servidor (UTC na Vercel): à noite o painel mostrava o dia seguinte.
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: company.companyTimezone,
  }).format(agora);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: company.companyTimezone,
  }).format(agora);

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {/* Mesmo nome do menu e do ícone instalado: eram três para o mesmo lugar. */}
          <h1 className="text-fg text-2xl font-semibold tracking-tight sm:text-3xl">
            Central operacional
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
            <span className="first-letter:uppercase">{hoje}</span>
            <span aria-hidden>·</span>
            <span>atualizado às {hora}</span>
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
    </div>
  );
}

async function Prioridades(props: Parameters<typeof PrioridadesConteudo>[0]) {
  return protegida("as prioridades de hoje", () => PrioridadesConteudo(props));
}

async function Sugestoes(props: Parameters<typeof SugestoesConteudo>[0]) {
  return protegida("as sugestões do sistema", () => SugestoesConteudo(props));
}

async function Financial(props: Parameters<typeof ResultadoDoMes>[0]) {
  return protegida("o resultado do mês", () => ResultadoDoMes(props));
}

async function RecentActivity(props: Parameters<typeof AtividadeConteudo>[0]) {
  return protegida("as movimentações recentes", () => AtividadeConteudo(props));
}

/**
 * A primeira coisa da tela: o que está em curso e o que pede ação hoje.
 *
 * Empresa que ainda não comprou nada vê os primeiros passos, não uma tela de
 * zeros.
 */
async function PrioridadesConteudo({
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
async function SugestoesConteudo({
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

async function ResultadoDoMes({
  companyId,
  timezone,
}: {
  companyId: string;
  timezone: string;
}) {
  // O fuso já vem com a sessão: perguntar de novo à tabela de empresas custava
  // uma ida ao banco EM SÉRIE antes de o financeiro poder começar.
  const financial = await getMonthFinancials(companyId, timezone);
  const semDados =
    financial.itensRecebidos === 0 && financial.cotacoesConcluidas === 0;

  return (
    <section
      className="border-border bg-surface mt-6 overflow-hidden rounded-2xl border shadow-xs"
      aria-labelledby="financial-title"
    >
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <h2 id="financial-title" className="text-fg text-base font-semibold">
          Resultado de {MONTH.format(new Date(`${financial.de}T12:00:00`))}
        </h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/analises">Ver análise completa</Link>
        </Button>
      </header>

      {semDados ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <WalletCards className="text-fg-subtle size-5" aria-hidden />
          <p className="text-fg-muted text-sm">
            Os resultados aparecem ao concluir uma cotação ou conferir a
            primeira entrada de mercadoria do mês.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {/* A resposta primeiro, em uma frase: "estou economizando?". O resto
              é detalhe de quem quer conferir a conta. */}
          <p className="text-fg text-lg leading-snug text-balance">
            <FraseDoMes financial={financial} />
          </p>

          {financial.itensRecebidos > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
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
          ) : null}

          <p className="text-fg-muted text-sm">
            {financial.cotacoesConcluidas > 0
              ? `${financial.cotacoesConcluidas} ${financial.cotacoesConcluidas === 1 ? "cotação concluída" : "cotações concluídas"} · pedidos previstos em ${MONEY.format(financial.valorPrevistoPedidos)}`
              : null}
            {financial.cotacoesConcluidas > 0 && financial.itensRecebidos > 0
              ? " · "
              : null}
            {financial.itensRecebidos > 0
              ? `${financial.itensRecebidos} ${financial.itensRecebidos === 1 ? "item recebido" : "itens recebidos"} · ${MONEY.format(financial.valorRecebido)} conferidos`
              : null}
          </p>

          {/* Embalagens são de poucos clientes: só aparecem quando há resultado. */}
          {financial.economiaEscolhaEmbalagensEstimada !== 0 ||
          financial.economiaEscolhaEmbalagensRealizada !== 0 ? (
            <p className="text-fg-muted text-sm">
              Escolha de embalagens: ganho de{" "}
              <strong className="text-fg tabular-nums">
                {MONEY.format(financial.economiaEscolhaEmbalagensEstimada)}
              </strong>{" "}
              previsto e{" "}
              <strong className="text-fg tabular-nums">
                {MONEY.format(financial.economiaEscolhaEmbalagensRealizada)}
              </strong>{" "}
              realizado, em relação à melhor alternativa de cada produto.
            </p>
          ) : null}

          <details className="group">
            <summary className="text-primary focus-visible:ring-ring/40 inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 transition-transform group-open:rotate-90"
                aria-hidden
              />
              Como ler estes números
            </summary>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              Economia é quanto o preço final ficou abaixo da proposta inicial;
              se for negativa, o preço terminou acima. A previsão considera as
              cotações encerradas no mês, e o realizado só o que já chegou.
              Pedidos diretos entram no valor conferido, mas não geram economia
              contra cotação. A escolha de embalagens vale só para produtos com
              finalidade Embalagem.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}

/**
 * O mês em uma frase.
 *
 * Com mercadoria já conferida, a economia REALIZADA é o que importa — é dinheiro
 * que já aconteceu — e a previsão das negociações vem como contexto. Sem nada
 * recebido ainda, a previsão é o único número, e a frase diz que o resto vem
 * conforme a mercadoria for conferida.
 */
function FraseDoMes({
  financial,
}: {
  financial: Awaited<ReturnType<typeof getMonthFinancials>>;
}) {
  const bom = "text-success font-semibold tabular-nums";
  const ruim = "text-destructive font-semibold tabular-nums";

  if (financial.itensRecebidos > 0) {
    const real = financial.economiaRealizada;
    const previsto = financial.economiaEstimada;
    return (
      <>
        {real > 0 ? (
          <>
            Você economizou <span className={bom}>{MONEY.format(real)}</span>{" "}
            nas compras já recebidas
          </>
        ) : real < 0 ? (
          <>
            As compras já recebidas ficaram{" "}
            <span className={ruim}>{MONEY.format(Math.abs(real))} acima</span>{" "}
            da proposta inicial
          </>
        ) : (
          <>As compras já recebidas fecharam no valor da proposta inicial</>
        )}
        {previsto !== 0 && financial.cotacoesConcluidas > 0 ? (
          <span className="text-fg-muted">
            {" "}
            — as negociações previam {previsto > 0 ? "" : "−"}
            {MONEY.format(Math.abs(previsto))}
          </span>
        ) : null}
        .
      </>
    );
  }

  const previsto = financial.economiaEstimada;
  return (
    <>
      {previsto > 0 ? (
        <>
          As negociações concluídas preveem economizar{" "}
          <span className={bom}>{MONEY.format(previsto)}</span>
        </>
      ) : previsto < 0 ? (
        <>
          As negociações concluídas preveem preço{" "}
          <span className={ruim}>{MONEY.format(Math.abs(previsto))} acima</span>{" "}
          da proposta inicial
        </>
      ) : (
        <>As negociações concluídas não preveem diferença de preço</>
      )}
      <span className="text-fg-muted">
        {" "}
        — o resultado real aparece conforme a mercadoria for conferida.
      </span>
    </>
  );
}

async function AtividadeConteudo({ companyId }: { companyId: string }) {
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
