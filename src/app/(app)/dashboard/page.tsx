import { AttentionList } from "@/components/dashboard/attention-list";
import { Metric } from "@/components/layout/metric";
import { PageHeader } from "@/components/layout/page-header";
import { getAttentionItems } from "@/features/dashboard/attention";
import { getSituationSummary } from "@/features/dashboard/situation";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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

  const [atencao, situacao] = await Promise.all([
    getAttentionItems(company.companyId, permissions),
    getSituationSummary(company.companyId, permissions),
  ]);

  const podeVerRodadas = permissions.has("purchase_round.view");
  const podeVerPedidos = permissions.has("order.view");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Central operacional"
        description={`${company.companyName} · ${company.roleName}`}
      />

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
    </div>
  );
}
