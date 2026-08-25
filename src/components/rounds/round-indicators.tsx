import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Metric } from "@/components/layout/metric";
import { Button } from "@/components/ui/button";
import {
  carregarIndicadoresDaRodada,
  carregarResumoPorFornecedor,
  pendenciasDaRodada,
} from "@/features/rounds/snapshot";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Os indicadores e as pendências da rodada — documento mestre, 6.3.
 *
 * A Central mostrava o que a rodada TEM: itens, grupos, fornecedores, com data
 * de envio e de resposta. Não dizia em que pé ela está nem o que falta — quem
 * quisesse saber contava linha por linha, e com vinte itens ninguém conta.
 *
 * Vem depois do resto por uma fronteira própria: são números, e número que
 * demora não pode segurar a tela que já está pronta.
 *
 * Só na rodada iniciada. Em preparação nada disso existe ainda — nenhum link
 * saiu, nenhuma resposta chegou — e os zeros diriam que algo está errado
 * quando na verdade a montagem nem terminou.
 */
export async function IndicadoresDaRodada({
  roundId,
  fornecedores,
  status,
}: {
  roundId: string;
  /** Nome por id — a tabela de fornecedores já os tem em mãos. */
  fornecedores: { supplierId: string; nome: string }[];
  status: string;
}) {
  const [i, resumo] = await Promise.all([
    carregarIndicadoresDaRodada(roundId),
    carregarResumoPorFornecedor(roundId),
  ]);
  if (!i) return null;

  const pendencias = pendenciasDaRodada(i, roundId);
  const comEscolha = fornecedores
    .map((f) => ({ ...f, resumo: resumo.get(f.supplierId) }))
    .filter((f) => f.resumo)
    .sort((a, b) => (b.resumo?.valorEscolhido ?? 0) - (a.resumo?.valorEscolhido ?? 0));

  return (
    <>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Responderam"
          value={`${i.fornecedoresResponderam} de ${i.fornecedores}`}
          hint={
            i.fornecedoresEnviados < i.fornecedores
              ? `${i.fornecedores - i.fornecedoresEnviados} sem receber o link`
              : "todos receberam o link"
          }
          tone={
            i.fornecedores > 0 && i.fornecedoresResponderam === i.fornecedores
              ? "good"
              : "neutral"
          }
        />
        <Metric
          label="Produtos com preço"
          value={`${i.itensComResposta} de ${i.itensAtivos}`}
          hint={
            i.itensNegociados > 0
              ? `${i.itensNegociados} ${i.itensNegociados === 1 ? "negociado" : "negociados"}`
              : "nenhum negociado ainda"
          }
        />
        <Metric
          label="Prontos para decidir"
          value={String(i.itensProntos)}
          hint="têm preço e ninguém escolheu"
        />
        <Metric
          label="Pedidos gerados"
          value={String(i.pedidosGerados)}
          hint={
            i.alocacoesRascunho > 0
              ? `${i.alocacoesRascunho} ${i.alocacoesRascunho === 1 ? "decisão" : "decisões"} sem confirmar`
              : `${i.itensAlocados} ${i.itensAlocados === 1 ? "produto decidido" : "produtos decididos"}`
          }
        />
      </section>

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">O que falta</h2>
        <p className="text-fg-muted mb-3 text-sm">
          Na ordem do fluxo: a primeira linha é a próxima coisa a fazer.
        </p>

        {status === "completed" ? (
          <p className="border-success/30 bg-success-soft text-success flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="block">Rodada concluída</strong>
              Os pedidos gerados seguem normalmente em Pedidos; não ficou nada
              pendente nesta cotação.
            </span>
          </p>
        ) : status === "cancelled" ? (
          <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
            Esta rodada foi cancelada e não possui próximos passos.
          </p>
        ) : pendencias.length === 0 ? (
          <p className="border-border text-fg-muted flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
            <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
            Nada pendente nesta rodada.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendencias.map((p) => (
              <li
                key={p.chave}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <span className="flex min-w-0 items-start gap-2.5">
                  <AlertTriangle
                    className={
                      p.travando
                        ? "text-destructive mt-0.5 size-4 shrink-0"
                        : "text-fg-subtle mt-0.5 size-4 shrink-0"
                    }
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="text-fg block text-sm font-medium">
                      {p.texto}
                    </span>
                    <span className="text-fg-muted block text-sm">
                      {p.detalhe}
                    </span>
                  </span>
                </span>
                {p.href && p.acao ? (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={p.href}>
                      {p.acao}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* A visão por fornecedor que a 6.3 pede. A tabela de baixo conta a
          COMUNICAÇÃO — enviado, abriu, respondeu; esta conta o COMÉRCIO: de
          quem se está comprando e quanto. Só aparece quando já houve escolha,
          senão seria uma lista vazia repetindo o que os indicadores dizem. */}
      {comEscolha.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Compra por fornecedor
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            O que já foi escolhido nesta rodada, do maior para o menor.
          </p>
          <ul className="flex flex-col gap-2">
            {comEscolha.map((f) => (
              <li
                key={f.supplierId}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
              >
                <span className="text-fg text-sm font-medium">{f.nome}</span>
                <span className="text-fg-muted flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    {f.resumo!.itensEscolhidos}{" "}
                    {f.resumo!.itensEscolhidos === 1 ? "produto" : "produtos"}
                  </span>
                  {f.resumo!.confirmados < f.resumo!.itensEscolhidos ? (
                    <span className="text-fg-subtle text-xs">
                      {f.resumo!.itensEscolhidos - f.resumo!.confirmados} em
                      rascunho
                    </span>
                  ) : null}
                  <span className="text-fg font-medium tabular-nums">
                    {MONEY.format(f.resumo!.valorEscolhido)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
