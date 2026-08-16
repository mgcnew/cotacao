import Link from "next/link";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AttentionList } from "@/components/dashboard/attention-list";
import { FirstSteps } from "@/components/dashboard/first-steps";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
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
const MES = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Central Operacional — documento mestre, seção 13.
 *
 * A ordem da página é a ordem das perguntas que ela responde: primeiro o que
 * precisa de atenção agora, depois como estão as compras, depois o dinheiro.
 * Pendência acionável vem antes de qualquer número — o documento é explícito
 * que atividade recente tem prioridade inferior.
 */
export default async function DashboardPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  const podeVerRodadas = permissions.has("purchase_round.view");
  const podeVerPedidos = permissions.has("order.view");
  const podeVerFinanceiro = permissions.has("analytics.view");

  const [atencao, situacao, dados, atividade] = await Promise.all([
    getAttentionItems(company.companyId, permissions),
    getSituationSummary(company.companyId, permissions),
    podeVerFinanceiro ? getCompany(company.companyId) : null,
    listRecentActivity(company.companyId),
  ]);

  const financeiro = dados
    ? await getMonthFinancials(company.companyId, dados.timezone)
    : null;

  // Empresa que ainda não cotou nem comprou não tem o que acompanhar. Em vez
  // de uma tela de zeros, os passos até a primeira cotação.
  const comecando =
    situacao.rondasAtivas === 0 &&
    situacao.pedidosEmAberto === 0 &&
    atencao.length === 0;
  const passos = comecando
    ? await getFirstSteps(company.companyId, permissions)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Central operacional"
        description={`${company.companyName} · ${company.roleName}`}
      />

      {passos && passos.length > 0 ? (
        <div className="mb-8">
          <FirstSteps steps={passos} />
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Precisa da sua atenção
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Condições que continuam valendo até alguém resolver — diferente do
          sino, que avisa o que acabou de acontecer.
        </p>
        <AttentionList items={atencao} />
      </section>

      {podeVerRodadas || podeVerPedidos ? (
        <section className="mb-8">
          <h2 className="text-fg mb-3 text-sm font-semibold">Em andamento</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {podeVerRodadas ? (
              <>
                <Metric
                  label="Rodadas de compra"
                  value={String(situacao.rondasAtivas)}
                  hint={
                    situacao.rodadaUnica
                      ? situacao.rodadaUnica.title
                      : "cotações abertas agora"
                  }
                  href={
                    situacao.rodadaUnica
                      ? `/compras/${situacao.rodadaUnica.id}`
                      : "/compras"
                  }
                />
                <Metric
                  label="Aguardando resposta"
                  value={String(situacao.fornecedoresPendentes)}
                  hint="fornecedores que ainda não responderam"
                  href="/compras"
                />
              </>
            ) : null}

            {podeVerPedidos ? (
              <>
                <Metric
                  label="Pedidos em aberto"
                  value={String(situacao.pedidosEmAberto)}
                  hint="enviados e ainda não recebidos por inteiro"
                  href="/pedidos?situacao=abertos"
                />
                <Metric
                  label="Atrasados"
                  value={String(situacao.pedidosAtrasados)}
                  hint="prazo vencido, mercadoria por vir"
                  tone={situacao.pedidosAtrasados > 0 ? "bad" : "neutral"}
                  href="/pedidos?situacao=atrasados"
                />
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {financeiro ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-fg text-sm font-semibold">
              Financeiro de {MES.format(new Date(`${financeiro.de}T12:00:00`))}
            </h2>
            <Link
              href="/analises"
              className="text-primary text-xs underline-offset-4 hover:underline"
            >
              Cruzar período, produto e fornecedor em Análises
            </Link>
          </div>

          {financeiro.itensRecebidos === 0 ? (
            <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
              Nenhuma mercadoria recebida neste mês. Economia se mede contra o
              preço da nota fiscal, então os números aparecem depois da primeira
              entrada.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Total comprado"
                value={MONEY.format(financeiro.totalComprado)}
                hint={`${financeiro.itensRecebidos} ${financeiro.itensRecebidos === 1 ? "item recebido" : "itens recebidos"}, pelo preço da nota`}
              />
              <Metric
                label="Economia negociada"
                value={MONEY.format(financeiro.economiaNegociada)}
                hint="cotado menos combinado"
              />
              <Metric
                label="Economia realizada"
                value={MONEY.format(financeiro.economiaRealizada)}
                hint="cotado menos o preço da nota"
                // Realizada negativa é a nota tendo vindo acima do cotado:
                // não é ausência de economia, é prejuízo, e merece o alerta.
                tone={
                  financeiro.economiaRealizada > 0
                    ? "good"
                    : financeiro.economiaRealizada < 0
                      ? "bad"
                      : "neutral"
                }
              />
              <Metric
                label="Impacto de divergências"
                value={MONEY.format(financeiro.impactoDivergencias)}
                hint="o que a nota cobrou além do combinado"
                tone={financeiro.impactoDivergencias > 0 ? "bad" : "neutral"}
              />
            </div>
          )}
        </section>
      ) : null}

      {atividade.length > 0 ? (
        <section>
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Atividade recente
          </h2>
          <p className="text-fg-muted mb-2 text-sm">
            O que andou acontecendo. Fica por último de propósito: o que exige
            ação está lá em cima.
          </p>
          <ActivityFeed entries={atividade} />
        </section>
      ) : null}

      {/* Página inteira renderizada no servidor a cada visita. O carimbo evita
          a dúvida de sempre diante de um painel: "isto é de quando?" */}
      <p className="text-fg-subtle mt-8 text-xs">
        Números apurados em {HORA.format(new Date())}.
      </p>
    </div>
  );
}
