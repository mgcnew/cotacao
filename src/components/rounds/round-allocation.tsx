import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  Sparkles,
  Store,
} from "lucide-react";
import Link from "next/link";

import {
  AllocateForm,
  ApplyRecommendationsForm,
  ConfirmOrdersBar,
  type OrderPreview,
} from "@/components/allocations/allocation-forms";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelAllocation } from "@/features/allocations/actions";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";
import type { DadosDaAlocacao } from "@/features/rounds/alocacao";
import {
  LIMITE_ALTA,
  LIMITE_RUIDO,
  compararComUltimoPago,
} from "@/features/rounds/last-paid";
import { situacaoDoLimite } from "@/features/rounds/purchase-limit";
import { AindaSemRespostas, resumoDeRespostas } from "@/components/rounds/awaiting-responses";
import { OffersPopover, type Offer } from "@/components/rounds/offers-popover";
import { CompleteRoundForm } from "@/components/rounds/round-closing";
import { SupplierJump } from "@/components/rounds/supplier-jump";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

type Row = DadosDaAlocacao["rows"][number];
type Allocation = NonNullable<ReturnType<DadosDaAlocacao["allocationsByItem"]["get"]>>[number];
type Candidate = {
  id: string;
  name: string;
  price: number;
  comparisonPrice: number;
  pricingFactor: number | null;
};
type Recommendation = { row: Row; candidates: Candidate[]; winner: Candidate };
type SupplierBucket = {
  id: string;
  name: string;
  recommendations: Recommendation[];
  decisions: { row: Row; allocation: Allocation }[];
};

function candidatesFor(row: Row, dados: DadosDaAlocacao): Candidate[] {
  const candidates = dados.suppliers
    .filter((supplier) => supplier.removed_at === null)
    .flatMap((supplier) => {
      const cell = row.cells.get(supplier.id);
      return cell && !cell.doesNotSupply && cell.isAvailable !== false && cell.currentPrice !== null
        ? [{
            id: supplier.supplier_id,
            name: supplier.suppliers.name,
            price: cell.currentPrice,
            normalizedPrice: cell.normalizedPrice,
            pricingFactor:
              !row.requiresPricingConversion
                ? 1
                : (cell.conversionFactor ?? row.estimatedConversionRate),
          }]
        : [];
    });
  // Misturar preço normalizado de alguns com preço bruto de outros criaria uma
  // ordem sem unidade comum. Só usamos a normalização quando todos têm base.
  const useNormalized =
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.normalizedPrice !== null);
  if (row.requiresPresentationComparison && !useNormalized) return [];
  return candidates
    .map(({ normalizedPrice, ...candidate }) => ({
      ...candidate,
      comparisonPrice:
        useNormalized && normalizedPrice !== null
          ? normalizedPrice
          : candidate.price,
    }))
    .sort(
      (a, b) =>
        a.comparisonPrice - b.comparisonPrice || a.name.localeCompare(b.name),
    );
}

/**
 * Todas as ofertas com preço para o item, da mais barata para a mais cara.
 *
 * Independe de `candidatesFor`: aquela devolve vazio quando as propostas não
 * têm base comum de comparação, e justamente aí a pessoa mais quer ver os
 * números lado a lado.
 */
function ofertasDoItem(row: Row, dados: DadosDaAlocacao): { offers: Offer[]; withoutOffer: number } {
  const ativos = dados.suppliers.filter((supplier) => supplier.removed_at === null);
  const offers = ativos.flatMap((supplier) => {
    const cell = row.cells.get(supplier.id);
    return cell && !cell.doesNotSupply && cell.isAvailable !== false && cell.currentPrice !== null
      ? [{
          supplierId: supplier.supplier_id,
          name: supplier.suppliers.name,
          price: cell.currentPrice,
          quotedPrice: cell.quotedPrice,
          negotiated: cell.negotiated,
          comparisonPrice: cell.normalizedPrice,
        }]
      : [];
  });
  // Misturar normalizado de uns com bruto de outros não tem unidade comum: se
  // algum não tem base, ninguém usa a comparação.
  const normalizado = row.requiresPresentationComparison && offers.length > 0 && offers.every((offer) => offer.comparisonPrice !== null);
  const lista = offers
    .map((offer) => ({ ...offer, comparisonPrice: normalizado ? offer.comparisonPrice : null }))
    .sort((a, b) => (a.comparisonPrice ?? a.price) - (b.comparisonPrice ?? b.price) || a.name.localeCompare(b.name));
  return { offers: lista, withoutOffer: ativos.length - lista.length };
}

/** O ícone ao lado do preço: só aparece quando há com o que comparar. */
function Ofertas({ row, dados, supplierId }: { row: Row; dados: DadosDaAlocacao; supplierId: string }) {
  const { offers, withoutOffer } = ofertasDoItem(row, dados);
  if (offers.length < 2) return null;
  return <OffersPopover productName={row.productName} unit={row.pricingUnit} comparisonUnit={row.comparisonUnit} chosenSupplierId={supplierId} offers={offers} withoutOffer={withoutOffer} />;
}

/** O que já foi decidido para o item (rascunho e confirmado), para o saldo do formulário. */
function decidedFor(row: Row, dados: DadosDaAlocacao) {
  return (dados.allocationsByItem.get(row.itemId) ?? []).map((allocation) => ({
    supplierId: allocation.supplierId,
    quantity: allocation.allocatedQuantity,
    status: allocation.status,
  }));
}

/**
 * `pending` é o que ainda vai virar pedido (escolhas salvas e sugestões): é a
 * base do limite de compras. `total` soma também o que já está no pedido, para
 * o placar mostrar tudo o que o fornecedor leva na rodada.
 */
function bucketTotals(supplier: SupplierBucket) {
  let confirmed = 0;
  let saved = 0;
  let suggested = 0;
  let withoutConversion = 0;
  let confirmedWithoutConversion = 0;
  for (const { allocation } of supplier.decisions) {
    const isConfirmed = allocation.status === "confirmed";
    if (allocation.estimatedPricingQuantity === null) {
      if (isConfirmed) confirmedWithoutConversion += 1;
      else withoutConversion += 1;
      continue;
    }
    const value = allocation.estimatedPricingQuantity * allocation.selectedPrice;
    if (isConfirmed) confirmed += value;
    else saved += value;
  }
  for (const { row, winner } of supplier.recommendations) {
    if (winner.pricingFactor === null) withoutConversion += 1;
    else suggested += row.requestedQuantity * winner.pricingFactor * winner.price;
  }
  const pending = saved + suggested;
  return { confirmed, saved, suggested, pending, total: confirmed + pending, withoutConversion, confirmedWithoutConversion };
}

/** Quantos itens do fornecedor estão em cada situação. */
function bucketCounts(supplier: SupplierBucket) {
  const confirmed = supplier.decisions.filter(({ allocation }) => allocation.status === "confirmed").length;
  return {
    confirmed,
    saved: supplier.decisions.length - confirmed,
    suggested: supplier.recommendations.length,
    total: supplier.decisions.length + supplier.recommendations.length,
  };
}

function countsLabel(counts: ReturnType<typeof bucketCounts>) {
  return [
    `${counts.total} ${counts.total === 1 ? "item" : "itens"}`,
    counts.confirmed > 0 ? `${counts.confirmed} no pedido` : null,
    counts.saved > 0 ? `${counts.saved} ${counts.saved === 1 ? "salva" : "salvas"}` : null,
    counts.suggested > 0 ? `${counts.suggested} ${counts.suggested === 1 ? "sugestão" : "sugestões"}` : null,
  ].filter(Boolean).join(" · ");
}

const sectionId = (supplierId: string) => `fornecedor-${supplierId}`;

/** A proposta é automática, mas só vira rascunho depois de uma ação explícita. */
export function AlocacaoConteudo({
  dados,
  showReportAction = true,
}: {
  dados: DadosDaAlocacao;
  showReportAction?: boolean;
}) {
  const { round, rows, allocationsByItem, orders, rascunhos, fornecedoresNoRascunho, supplierName, podeVer, podeDecidir, podeConfirmar } = dados;

  if (!podeVer) {
    return <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">Seu papel não permite ver a decisão de compra desta rodada.</p>;
  }

  const buckets = new Map<string, SupplierBucket>();
  const recommendations: Recommendation[] = [];
  const partial: { row: Row; missing: number; candidates: Candidate[] }[] = [];
  const withoutPrice: Row[] = [];

  const confirmedQuantity = (row: Row) =>
    (allocationsByItem.get(row.itemId) ?? [])
      .filter((allocation) => allocation.status === "confirmed")
      .reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0);
  const isResolved = (row: Row) =>
    row.commercialStatus === "confirmed" ||
    row.commercialStatus === "closed_without_purchase" ||
    confirmedQuantity(row) >= row.requestedQuantity;
  const resolvedRows =
    round.status === "active" ? rows.filter(isResolved) : [];
  // Enquanto há trabalho, a tela começa no que ainda exige ação. Ao concluir,
  // a mesma rota vira histórico e volta a mostrar o conjunto inteiro.
  const workingRows =
    round.status === "active" ? rows.filter((row) => !isResolved(row)) : rows;

  const getBucket = (id: string, name: string) => {
    const current = buckets.get(id) ?? { id, name, recommendations: [], decisions: [] };
    buckets.set(id, current);
    return current;
  };

  // O fornecedor leva tudo o que ganhou na rodada, inclusive itens já fechados
  // em pedido: é o que o placar soma. Sugestões e exceções vêm só do que falta.
  for (const row of rows) {
    for (const allocation of allocationsByItem.get(row.itemId) ?? []) {
      const name = supplierName.get(allocation.supplierId) ?? "Fornecedor";
      getBucket(allocation.supplierId, name).decisions.push({ row, allocation });
    }
  }

  for (const row of workingRows) {
    const decisions = allocationsByItem.get(row.itemId) ?? [];
    const allocated = decisions.reduce((sum, decision) => sum + decision.allocatedQuantity, 0);
    const missing = row.requestedQuantity - allocated;
    const candidates = candidatesFor(row, dados);

    if (row.commercialStatus !== "open") {
      continue;
    }
    if (missing <= 0) continue;
    if (decisions.length > 0) partial.push({ row, missing, candidates });
    else if (candidates.length > 0) {
      const recommendation = { row, candidates, winner: candidates[0] };
      recommendations.push(recommendation);
      getBucket(recommendation.winner.id, recommendation.winner.name).recommendations.push(recommendation);
    } else withoutPrice.push(row);
  }

  // Quem leva mais dinheiro vem primeiro: é por onde a revisão começa.
  const bucketTotal = new Map([...buckets.values()].map((bucket) => [bucket.id, bucketTotals(bucket).total]));
  const supplierBuckets = [...buckets.values()].sort(
    (a, b) => (bucketTotal.get(b.id) ?? 0) - (bucketTotal.get(a.id) ?? 0) || a.name.localeCompare(b.name),
  );
  const attentionCount = partial.length + withoutPrice.length;
  const totals = supplierBuckets.reduce(
    (acc, bucket) => {
      const t = bucketTotals(bucket);
      return {
        saved: acc.saved + t.saved,
        suggested: acc.suggested + t.suggested,
        withoutConversion: acc.withoutConversion + t.withoutConversion,
      };
    },
    { saved: 0, suggested: 0, withoutConversion: 0 },
  );
  const decisionTotal = totals.saved + totals.suggested;
  // Quantos itens a decidir estão pelo menos `LIMITE_ALTA` acima do último
  // pago: é o que merece um olhar antes de gerar os pedidos.
  const acimaDoLimite = supplierBuckets.filter((bucket) => situacaoDoLimite(bucketTotals(bucket).pending, dados.limites.get(bucket.id))?.tipo === "acima").length;
  const acimaDoUltimo = [
    ...recommendations.map(({ row, winner }) => ({ productId: row.productId, supplierId: winner.id, price: winner.price, unit: row.pricingUnit })),
    ...supplierBuckets.flatMap((bucket) =>
      bucket.decisions
        .filter(({ allocation }) => allocation.status === "draft")
        .map(({ row, allocation }) => ({ productId: row.productId, supplierId: allocation.supplierId, price: allocation.selectedPrice, unit: row.pricingUnit })),
    ),
  ].filter((item) => {
    const comparacao = compararComUltimoPago(dados.ultimosPagos, item.productId, item.supplierId, item.price, item.unit);
    return comparacao !== null && comparacao.diff >= LIMITE_ALTA;
  }).length;
  // Quanto a sugestão economiza sobre a 2ª melhor oferta do mesmo item, só onde
  // as duas têm total calculável para a quantidade pedida.
  const savingOverSecond = recommendations.reduce((sum, item) => {
    const second = item.candidates[1];
    const { winner, row } = item;
    if (!second || winner.pricingFactor === null || second.pricingFactor === null) return sum;
    const gain =
      row.requestedQuantity * second.pricingFactor * second.price -
      row.requestedQuantity * winner.pricingFactor * winner.price;
    return gain > 0 ? sum + gain : sum;
  }, 0);

  // O que o botão final vai gerar: um pedido por fornecedor, só com rascunhos.
  const orderPreviews: OrderPreview[] = [];
  let draftCount = 0;
  let draftGrandTotal = 0;
  let draftWithoutConversion = 0;
  const previewBySupplier = new Map<string, OrderPreview>();
  for (const row of rows) {
    for (const allocation of allocationsByItem.get(row.itemId) ?? []) {
      if (allocation.status !== "draft") continue;
      const name = supplierName.get(allocation.supplierId) ?? "Fornecedor";
      const preview =
        previewBySupplier.get(allocation.supplierId) ??
        { supplierName: name, itemCount: 0, total: null, withoutConversion: 0, items: [], limit: dados.limites.get(allocation.supplierId) ?? null };
      preview.itemCount += 1;
      preview.items.push({ name: row.productName, quantity: `${QTY.format(allocation.allocatedQuantity)} ${row.purchaseUnit}` });
      if (allocation.estimatedPricingQuantity === null) {
        preview.withoutConversion += 1;
        draftWithoutConversion += 1;
      } else {
        const value = allocation.estimatedPricingQuantity * allocation.selectedPrice;
        preview.total = (preview.total ?? 0) + value;
        draftGrandTotal += value;
      }
      draftCount += 1;
      previewBySupplier.set(allocation.supplierId, preview);
    }
  }
  orderPreviews.push(...[...previewBySupplier.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName)));
  const remainingCount = attentionCount + recommendations.length;
  const respostas = resumoDeRespostas(rows, dados.suppliers);
  // Tudo decidido e nada em rascunho: o único passo que falta é concluir. É um
  // estado só — antes eram dois avisos empilhados, um amarelo e um verde, que
  // se contradiziam e mandavam para um lugar que não existe.
  const prontaParaConcluir =
    round.status === "active" &&
    rows.length > 0 &&
    workingRows.length === 0 &&
    rascunhos.length === 0;
  const totalResolved = rows.filter(isResolved).length;

  return (
    <>
      {round.status === "draft" || round.status === "cancelled" ? <p className="border-border bg-surface-sunken text-fg-muted mb-5 rounded-xl border px-4 py-3 text-sm">Esta rodada está <strong>{round.status === "draft" ? "em preparação" : "cancelada"}</strong>. Pedidos só podem ser gerados com a rodada em andamento.</p> : null}

      {prontaParaConcluir ? (
        <section
          aria-labelledby="tudo-decidido"
          className="border-success/30 bg-success-soft mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-4"
        >
          <div className="text-success flex min-w-0 items-start gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <h2 id="tudo-decidido" className="font-semibold">
                Tudo decidido
                {orders.length > 0
                  ? ` · ${orders.length} ${orders.length === 1 ? "pedido gerado" : "pedidos gerados"}`
                  : ""}
              </h2>
              <p className="mt-0.5">
                Falta só concluir a cotação para tirá-la do trabalho em aberto.
                Os pedidos seguem o caminho deles em Pedidos.
              </p>
            </div>
          </div>
          {dados.podeConcluir ? (
            <CompleteRoundForm
              roundId={round.id}
              openItemCount={rows.filter((row) => row.commercialStatus === "open").length}
              openGroupCount={dados.gruposAbertos}
            />
          ) : (
            <p className="text-fg-muted text-sm">Peça a quem pode concluir a rodada.</p>
          )}
        </section>
      ) : orders.length > 0 && round.status === "completed" ? (
        <div className="border-success/30 bg-success-soft text-success mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Pedidos gerados e rodada concluída</p>
            <p className="mt-0.5">
              Nenhum produto ficou pendente. Agora falta apenas enviar e acompanhar
              os pedidos listados abaixo.
            </p>
          </div>
        </div>
      ) : orders.length > 0 && round.status === "active" ? (
        <div className="border-warning/30 bg-warning/5 mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong className="text-fg block">Os pedidos saíram, mas a rodada continua aberta</strong>
            <span className="text-fg-muted block">
              {rascunhos.length > 0
                ? `${rascunhos.length} ${rascunhos.length === 1 ? "decisão ainda está" : "decisões ainda estão"} em rascunho.`
                : `${remainingCount} ${remainingCount === 1 ? "produto ainda precisa" : "produtos ainda precisam"} de decisão ou encerramento sem compra.`}
            </span>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nada para decidir" description="A decisão de compra aparece quando a rodada tem itens e respostas de fornecedores." />
      ) : round.status === "active" && !respostas.comPreco ? (
        <AindaSemRespostas roundId={round.id} responderam={respostas.responderam} total={respostas.total} tela="decidir" />
      ) : round.status === "active" && workingRows.length === 0 ? null : (
        <>
          {round.status === "active" ? (
            <section className="border-primary/25 bg-primary/[0.035] mb-5 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-fg text-sm font-semibold">
                    {totalResolved} de {rows.length} itens fechados
                  </p>
                  <p className="text-fg-muted mt-0.5 text-[13px]">
                    Abaixo aparecem somente os {workingRows.length} que ainda
                    precisam de decisão ou confirmação.
                  </p>
                </div>
                <Badge variant="outline">{workingRows.length} pendentes</Badge>
              </div>
              <div
                role="progressbar"
                aria-label="Itens fechados"
                aria-valuemin={0}
                aria-valuemax={rows.length}
                aria-valuenow={totalResolved}
                className="bg-surface-muted mt-3 h-1.5 overflow-hidden rounded-full"
              >
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${rows.length > 0 ? (totalResolved / rows.length) * 100 : 0}%` }}
                />
              </div>
            </section>
          ) : null}

          {round.status === "completed" ? (
            <CompletedSummary
              dados={dados}
              showReportAction={showReportAction}
            />
          ) : (
          <section className="mb-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-fg flex items-center gap-2 text-base font-semibold"><Sparkles className="text-primary size-4" aria-hidden /> Proposta de compra</h2>
                <p className="text-fg-muted text-sm">O menor preço vigente já vem escolhido. Salve as sugestões e, depois, gere os pedidos.</p>
              </div>
              {podeDecidir && round.status === "active" && recommendations.length > 0 ? <ApplyRecommendationsForm roundId={round.id} itemCount={recommendations.length} /> : null}
            </div>
            <div className="border-border bg-surface rounded-xl border p-4">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div aria-live="polite">
                  <p className="text-fg-muted text-sm">Total da decisão</p>
                  <p className="text-fg text-2xl font-semibold tabular-nums">{MONEY.format(decisionTotal)}</p>
                  <p className="text-fg-muted text-[13px] tabular-nums">
                    escolhas salvas {MONEY.format(totals.saved)} · sugestões {MONEY.format(totals.suggested)}
                    {totals.withoutConversion > 0 ? <span className="text-warning"> · {totals.withoutConversion} {totals.withoutConversion === 1 ? "item" : "itens"} sem conversão, fora do total</span> : null}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-fg-muted text-[13px]">Falta decidir</dt>
                    <dd className="text-fg font-semibold tabular-nums">{recommendations.length + attentionCount} {recommendations.length + attentionCount === 1 ? "item" : "itens"}</dd>
                  </div>
                  {savingOverSecond > 0 ? (
                    <div>
                      <dt className="text-fg-muted text-[13px]">Economia sobre a 2ª oferta</dt>
                      <dd className="text-success font-semibold tabular-nums">{MONEY.format(savingOverSecond)}</dd>
                    </div>
                  ) : null}
                  {acimaDoLimite > 0 ? (
                    <div>
                      <dt className="text-fg-muted text-[13px]">Acima do limite</dt>
                      <dd className="text-warning font-semibold tabular-nums">{acimaDoLimite} {acimaDoLimite === 1 ? "fornecedor" : "fornecedores"}</dd>
                    </div>
                  ) : null}
                  {acimaDoUltimo > 0 ? (
                    <div>
                      <dt className="text-fg-muted text-[13px]">Acima do último pago</dt>
                      <dd className="text-warning font-semibold tabular-nums">{acimaDoUltimo} {acimaDoUltimo === 1 ? "item" : "itens"}</dd>
                    </div>
                  ) : null}
                  {withoutPrice.length > 0 ? (
                    <div>
                      <dt className="text-fg-muted text-[13px]">Sem preço</dt>
                      <dd className="text-warning font-semibold tabular-nums">{withoutPrice.length}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </section>
          )}

          {round.status === "completed" ? (
            <CompletedRoundResult dados={dados} />
          ) : (
            <div className="mb-6 space-y-3">
              {supplierBuckets.length > 0 ? <SupplierScoreboard buckets={supplierBuckets} dados={dados} /> : null}
              {supplierBuckets.map((supplier) => <SupplierSection key={supplier.id} supplier={supplier} dados={dados} defaultOpen={supplierBuckets.length === 1} />)}
            </div>
          )}

          {round.status !== "completed" && attentionCount > 0 ? (
            <section className="border-warning/30 bg-warning/5 mb-6 rounded-xl border p-4">
              <h2 className="text-fg flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="text-warning size-4" aria-hidden /> Exceções para revisar</h2>
              <div className="mt-3 space-y-3">
                {partial.map(({ row, missing, candidates }) => (
                  <div key={row.itemId} className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-[13px]">Faltam {QTY.format(missing)} {row.purchaseUnit} para cobrir</p></div>
                    {podeDecidir && candidates.length > 0 && round.status === "active" ? <AllocateForm roundId={round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} pricingUnit={row.pricingUnit} requiresPricingConversion={row.requiresPricingConversion} estimatedConversionRate={row.estimatedConversionRate} suppliers={candidates} suggestedQuantity={missing} initialSupplierId={candidates[0].id} buttonLabel="Completar" requestedQuantity={row.requestedQuantity} decided={decidedFor(row, dados)} /> : null}
                  </div>
                ))}
                {withoutPrice.map((row) => <div key={row.itemId} className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"><div className="flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-[13px]">{row.requiresPresentationComparison ? "Falta informar a apresentação em uma ou mais propostas" : "Nenhum fornecedor respondeu com preço"}</p></div><Badge variant="destructive">{row.requiresPresentationComparison ? "conversão pendente" : "sem preço"}</Badge></div>)}
              </div>
            </section>
          ) : null}

          {round.status !== "completed" && resolvedRows.length > 0 ? (
            <ResolvedItems
              rows={resolvedRows}
              allocationsByItem={allocationsByItem}
              supplierName={supplierName}
            />
          ) : null}
        </>
      )}

      {podeConfirmar && rascunhos.length > 0 && fornecedoresNoRascunho.size > 0 && round.status === "active" ? (
        <ConfirmOrdersBar
          roundId={round.id}
          draftCount={draftCount > 0 ? draftCount : rascunhos.length}
          orders={orderPreviews}
          grandTotal={draftGrandTotal}
          withoutConversion={draftWithoutConversion}
        />
      ) : null}
      {orders.length > 0 ? <GeneratedOrders orders={orders} /> : null}
    </>
  );
}

function CompletedRoundResult({ dados }: { dados: DadosDaAlocacao }) {
  const groups = new Map<string, Row[]>();
  for (const row of dados.rows) {
    const list = groups.get(row.groupName) ?? [];
    list.push(row);
    groups.set(row.groupName, list);
  }

  const supplierResults = dados.suppliers
    .map((supplier) => {
      let wins = 0;
      let losses = 0;
      let noResponse = 0;
      let unavailable = 0;
      let awarded = 0;
      let uncalculatedWins = 0;

      for (const row of dados.rows) {
        const assigned =
          row.supplierQuotationItemBySupplier.has(supplier.id) ||
          row.cells.has(supplier.id);
        if (!assigned) continue;
        const allocations = (dados.allocationsByItem.get(row.itemId) ?? []).filter(
          (allocation) =>
            allocation.status === "confirmed" &&
            allocation.supplierId === supplier.supplier_id,
        );
        const cell = row.cells.get(supplier.id);
        if (allocations.length > 0) {
          wins += 1;
          awarded += allocations.reduce(
            (sum, allocation) =>
              sum + (allocation.estimatedPricingQuantity ?? 0) * allocation.selectedPrice,
            0,
          );
          if (
            allocations.some(
              (allocation) => allocation.estimatedPricingQuantity === null,
            )
          ) {
            uncalculatedWins += 1;
          }
        } else if (cell?.doesNotSupply || cell?.isAvailable === false) unavailable += 1;
        else if (cell?.currentPrice !== null && cell?.currentPrice !== undefined)
          losses += 1;
        else noResponse += 1;
      }

      return {
        id: supplier.id,
        name: supplier.suppliers.name,
        wins,
        losses,
        noResponse,
        unavailable,
        awarded,
        uncalculatedWins,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.awarded - a.awarded || a.name.localeCompare(b.name));

  return (
    <div className="mb-6 space-y-5">
      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Resultado por fornecedor
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Quem ganhou, perdeu ou não apresentou preço no escopo recebido.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {supplierResults.map((supplier) => (
            <article key={supplier.id} className="border-border bg-surface rounded-xl border p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <h3 className="text-fg min-w-0 font-semibold wrap-anywhere">
                  {supplier.name}
                </h3>
                {supplier.wins > 0 ? (
                  <Badge variant="secondary">{supplier.wins} ganhos</Badge>
                ) : (
                  <Badge variant="outline">sem ganho</Badge>
                )}
              </div>
              <p className="text-fg mt-2 text-lg font-semibold tabular-nums">
                {MONEY.format(supplier.awarded)}
              </p>
              <p className="text-fg-muted text-[13px]">valor estimado adjudicado</p>
              {supplier.uncalculatedWins > 0 ? (
                <p className="text-warning mt-1 text-[13px]">
                  {supplier.uncalculatedWins} {supplier.uncalculatedWins === 1 ? "item sem conversão" : "itens sem conversão"}
                </p>
              ) : null}
              <div className="text-fg-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                <span>{supplier.losses} perdidos</span>
                <span>{supplier.noResponse} sem preço</span>
                {supplier.unavailable > 0 ? (
                  <span>{supplier.unavailable} não fornece</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Produtos por grupo
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Todas as propostas finais, com a decisão vencedora destacada.
        </p>
        <div className="space-y-3">
          {[...groups.entries()].map(([groupName, rows], index) => (
            <details
              key={groupName}
              open={index === 0}
              className="border-border bg-surface overflow-hidden rounded-xl border"
            >
              <summary className="bg-surface-sunken flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-fg min-w-0 flex-1 text-sm font-semibold">
                  {groupName}
                </span>
                <Badge variant="outline">{rows.length} itens</Badge>
                <ChevronDown className="text-fg-muted size-4" aria-hidden />
              </summary>
              <div className="divide-border divide-y">
                {rows.map((row) => (
                  <CompletedItemResult key={row.itemId} row={row} dados={dados} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompletedItemResult({ row, dados }: { row: Row; dados: DadosDaAlocacao }) {
  const decisions = (dados.allocationsByItem.get(row.itemId) ?? []).filter(
    (allocation) => allocation.status === "confirmed",
  );

  return (
    <article className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-fg text-sm font-semibold">{row.productName}</h3>
          <p className="text-fg-muted text-[13px]">
            {QTY.format(row.requestedQuantity)} {row.purchaseUnit} · preço por {row.pricingUnit}
          </p>
        </div>
        <Badge variant={decisions.length > 0 ? "secondary" : "outline"}>
          {decisions.length > 0
            ? decisions.length > 1
              ? `${decisions.length} vencedores`
              : "comprado"
            : "sem compra"}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {dados.suppliers
          .filter(
            (supplier) =>
              row.supplierQuotationItemBySupplier.has(supplier.id) ||
              row.cells.has(supplier.id),
          )
          .map((supplier) => {
          const cell = row.cells.get(supplier.id);
          const wins = decisions.filter(
            (allocation) => allocation.supplierId === supplier.supplier_id,
          );
          const wonQuantity = wins.reduce(
            (sum, allocation) => sum + allocation.allocatedQuantity,
            0,
          );
          const estimatedTotal = wins.reduce(
            (sum, allocation) =>
              sum + (allocation.estimatedPricingQuantity ?? 0),
            0,
          );
          const selectedPrice =
            wins.length === 0
              ? null
              : estimatedTotal > 0 &&
                  wins.every(
                    (allocation) =>
                      allocation.estimatedPricingQuantity !== null,
                  )
                ? wins.reduce(
                    (sum, allocation) =>
                      sum +
                      allocation.selectedPrice *
                        (allocation.estimatedPricingQuantity ?? 0),
                    0,
                  ) / estimatedTotal
                : wins.reduce(
                    (sum, allocation) =>
                      sum +
                      allocation.selectedPrice * allocation.allocatedQuantity,
                    0,
                  ) / wonQuantity;
          const packagingChoiceResult = wins.reduce(
            (sum, allocation) =>
              sum + (allocation.packagingChoiceResultEstimated ?? 0),
            0,
          );
          const hasPrice =
            cell?.currentPrice !== null && cell?.currentPrice !== undefined;

          return (
            <div
              key={supplier.id}
              className={
                wins.length > 0
                  ? "border-success/35 bg-success-soft rounded-lg border p-2.5"
                  : "border-border bg-surface-sunken rounded-lg border p-2.5"
              }
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="text-fg min-w-0 text-[13px] font-semibold wrap-anywhere">
                  {supplier.suppliers.name}
                </p>
                {wins.length > 0 ? (
                  <Badge variant="secondary">ganhou</Badge>
                ) : hasPrice ? (
                  <Badge variant="outline">não selecionado</Badge>
                ) : null}
              </div>
              {wins.length > 0 ? (
                <>
                  <p className="text-success mt-1 text-sm font-semibold tabular-nums">
                    {MONEY.format(selectedPrice ?? 0)} / {row.pricingUnit}
                  </p>
                  <p className="text-fg-muted text-[13px]">
                    {QTY.format(wonQuantity)} {row.purchaseUnit} adjudicados
                  </p>
                  {cell?.negotiated && cell.quotedPrice !== null ? (
                    <p className="text-fg-muted text-[13px] line-through tabular-nums">
                      Original: {MONEY.format(cell.quotedPrice)}
                    </p>
                  ) : null}
                  {packagingChoiceResult !== 0 ? (
                    <p className={packagingChoiceResult > 0 ? "text-success mt-1 text-[13px] font-medium" : "text-danger mt-1 text-[13px] font-medium"}>
                      Escolha da embalagem: {MONEY.format(packagingChoiceResult)}
                    </p>
                  ) : null}
                </>
              ) : cell?.doesNotSupply ? (
                <p className="text-fg-muted mt-1 text-[13px]">Não fornece</p>
              ) : cell?.isAvailable === false ? (
                <p className="text-fg-muted mt-1 text-[13px]">
                  Sem disponibilidade nesta cotação
                </p>
              ) : hasPrice ? (
                <>
                  <p className="text-fg mt-1 text-sm font-semibold tabular-nums">
                    {MONEY.format(cell.currentPrice ?? 0)} / {row.pricingUnit}
                  </p>
                  {cell?.negotiated && cell.quotedPrice !== null ? (
                    <p className="text-fg-muted text-[13px] line-through tabular-nums">
                      Original: {MONEY.format(cell.quotedPrice)}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-fg-muted mt-1 text-[13px]">Sem preço informado</p>
              )}
            </div>
          );
          })}
      </div>
    </article>
  );
}

function CompletedSummary({
  dados,
  showReportAction,
}: {
  dados: DadosDaAlocacao;
  showReportAction: boolean;
}) {
  const confirmed = dados.rows.flatMap((row) =>
    (dados.allocationsByItem.get(row.itemId) ?? [])
      .filter((allocation) => allocation.status === "confirmed")
      .map((allocation) => ({ row, allocation })),
  );
  const suppliers = new Set(confirmed.map(({ allocation }) => allocation.supplierId));
  const calculable = confirmed.filter(
    ({ allocation }) => allocation.estimatedPricingQuantity !== null,
  );
  const calculableItems = new Set(calculable.map(({ row }) => row.itemId)).size;
  const purchasedItems = new Set(confirmed.map(({ row }) => row.itemId)).size;
  const estimatedTotal = calculable.reduce(
    (sum, { allocation }) =>
      sum + (allocation.estimatedPricingQuantity ?? 0) * allocation.selectedPrice,
    0,
  );
  const negotiatedSavings = calculable.reduce((sum, { row, allocation }) => {
    const roundSupplier = dados.suppliers.find(
      (supplier) => supplier.supplier_id === allocation.supplierId,
    );
    const originalPrice = roundSupplier
      ? row.cells.get(roundSupplier.id)?.quotedPrice
      : null;
    if (originalPrice === null || originalPrice === undefined) return sum;
    return (
      sum +
      Math.max(0, originalPrice - allocation.selectedPrice) *
        (allocation.estimatedPricingQuantity ?? 0)
    );
  }, 0);
  const packagingChoiceResult = confirmed.reduce(
    (sum, { allocation }) =>
      sum + (allocation.packagingChoiceResultEstimated ?? 0),
    0,
  );
  const withoutPurchase = dados.rows.filter(
    (row) => row.commercialStatus === "closed_without_purchase",
  ).length;

  return (
    <section className="mb-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-base font-semibold">Resultado da cotação</h2>
          <p className="text-fg-muted text-sm">
            Visão consolidada das decisões que viraram pedido. Os valores ainda
            são estimados quando compra e precificação usam unidades diferentes.
          </p>
        </div>
        {showReportAction ? (
          <Button asChild variant="outline" className="h-11 sm:h-9">
            <Link href={`/compras/${dados.round.id}/relatorio`}>
              Abrir relatório gerencial
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Summary label="Itens cotados" value={String(dados.rows.length)} detail={withoutPurchase > 0 ? `${withoutPurchase} encerrados sem compra` : "escopo concluído"} />
        <Summary label="Fornecedores vencedores" value={String(suppliers.size)} detail={[...suppliers].map((id) => dados.supplierName.get(id)).filter(Boolean).join(", ") || "nenhum"} />
        <Summary label="Valor estimado" value={MONEY.format(estimatedTotal)} detail={`${calculableItems}/${purchasedItems} itens calculáveis`} alert={calculableItems < purchasedItems} />
        <Summary label="Economia negociada" value={MONEY.format(negotiatedSavings)} detail="preço original x adjudicado" />
        <Summary label="Escolha de embalagens" value={MONEY.format(packagingChoiceResult)} detail="custo unitário x melhor alternativa" alert={packagingChoiceResult < 0} />
      </div>
    </section>
  );
}

function ResolvedItems({
  rows,
  allocationsByItem,
  supplierName,
}: {
  rows: Row[];
  allocationsByItem: DadosDaAlocacao["allocationsByItem"];
  supplierName: DadosDaAlocacao["supplierName"];
}) {
  return (
    <details className="border-border bg-surface mb-6 overflow-hidden rounded-xl border">
      <summary className="bg-surface-sunken flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <CheckCircle2 className="text-success size-4" aria-hidden />
        <span className="min-w-0 flex-1">Já fechados ({rows.length})</span>
        <span className="text-fg-muted text-[13px] font-normal">Consultar</span>
        <ChevronDown className="text-fg-muted size-4" aria-hidden />
      </summary>
      <ul className="divide-border divide-y">
        {rows.map((row) => {
          const decisions = (allocationsByItem.get(row.itemId) ?? []).filter(
            (allocation) => allocation.status === "confirmed",
          );
          return (
            <li key={row.itemId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="text-fg text-sm font-medium">{row.productName}</p>
                <p className="text-fg-muted text-[13px]">
                  {row.groupName} · {QTY.format(row.requestedQuantity)} {row.purchaseUnit}
                </p>
              </div>
              <div className="text-fg-muted text-[13px]">
                {decisions.length > 0
                  ? decisions
                      .map(
                        (allocation) =>
                          `${supplierName.get(allocation.supplierId) ?? "Fornecedor"}: ${QTY.format(allocation.allocatedQuantity)} ${row.purchaseUnit}`,
                      )
                      .join(" · ")
                  : "Encerrado sem compra"}
              </div>
              <Badge variant={decisions.length > 0 ? "secondary" : "outline"}>
                {decisions.length > 0 ? "pedido gerado" : "sem compra"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Tons da barra por posição no placar: quem leva mais fica com a cor cheia. */
const SCOREBOARD_TONES = ["bg-primary", "bg-primary/70", "bg-primary/50", "bg-primary/35", "bg-primary/20"];
const scoreboardTone = (index: number) => SCOREBOARD_TONES[Math.min(index, SCOREBOARD_TONES.length - 1)];

function sharePercent(share: number) {
  if (share <= 0) return "0%";
  if (share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/**
 * Quem leva o quê, em uma olhada: a barra divide o valor da rodada entre os
 * fornecedores e cada linha leva à seção dele, que abre já no lugar.
 */
function SupplierScoreboard({ buckets, dados }: { buckets: SupplierBucket[]; dados: DadosDaAlocacao }) {
  const lines = buckets.map((bucket) => {
    const totals = bucketTotals(bucket);
    return {
      bucket,
      totals,
      counts: bucketCounts(bucket),
      limit: situacaoDoLimite(totals.pending, dados.limites.get(bucket.id)),
    };
  });
  const grandTotal = lines.reduce((sum, line) => sum + line.totals.total, 0);
  const withoutConversion = lines.reduce(
    (sum, line) => sum + line.totals.withoutConversion + line.totals.confirmedWithoutConversion,
    0,
  );

  return (
    <section aria-labelledby="quem-leva" className="border-border bg-surface rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="quem-leva" className="text-fg text-sm font-semibold">Quem leva o quê</h2>
        <p className="text-fg-muted text-[13px] tabular-nums">
          {buckets.length} {buckets.length === 1 ? "fornecedor" : "fornecedores"} · {MONEY.format(grandTotal)} na rodada
        </p>
      </div>
      {grandTotal > 0 ? (
        <div aria-hidden className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {lines.map(({ bucket, totals }, index) =>
            totals.total > 0 ? (
              <span key={bucket.id} className={cn("h-full min-w-1 basis-0", scoreboardTone(index))} style={{ flexGrow: totals.total }} />
            ) : null,
          )}
        </div>
      ) : null}
      <ul className="mt-2">
        {lines.map(({ bucket, totals, counts, limit }, index) => (
          <li key={bucket.id}>
            <SupplierJump
              targetId={sectionId(bucket.id)}
              className="hover:bg-surface-sunken focus-visible:ring-ring/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 outline-none focus-visible:ring-3"
            >
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", scoreboardTone(index))} />
              <span className="min-w-0 flex-1">
                <span className="text-fg block text-sm font-medium wrap-anywhere">{bucket.name}</span>
                <span className="text-fg-muted block text-[13px]">
                  {countsLabel(counts)}
                  {limit?.tipo === "acima" ? (
                    <span className="text-warning font-medium"> · acima do limite (+{MONEY.format(limit.excesso)})</span>
                  ) : limit?.tipo === "perto" ? (
                    <span> · {Math.round(limit.uso * 100)}% do limite</span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="text-fg block text-sm font-semibold">{MONEY.format(totals.total)}</span>
                <span className="text-fg-muted block text-[13px]">{sharePercent(grandTotal > 0 ? totals.total / grandTotal : 0)}</span>
              </span>
              <ChevronRight className="text-fg-subtle size-4 shrink-0" aria-hidden />
            </SupplierJump>
          </li>
        ))}
      </ul>
      {withoutConversion > 0 ? (
        <p className="text-warning mt-2 text-[13px]">
          {withoutConversion} {withoutConversion === 1 ? "item sem conversão fica" : "itens sem conversão ficam"} fora dos valores.
        </p>
      ) : null}
    </section>
  );
}

function SupplierSection({ supplier, dados, defaultOpen }: { supplier: SupplierBucket; dados: DadosDaAlocacao; defaultOpen: boolean }) {
  const totals = bucketTotals(supplier);
  const counts = bucketCounts(supplier);
  const uncalculated = totals.withoutConversion + totals.confirmedWithoutConversion;
  const pendingCount = counts.saved + counts.suggested;
  const situacao = situacaoDoLimite(totals.pending, dados.limites.get(supplier.id));
  // O que ainda pede decisão em cima; o que já está no pedido fica por último.
  const drafts = supplier.decisions.filter(({ allocation }) => allocation.status !== "confirmed");
  const confirmed = supplier.decisions.filter(({ allocation }) => allocation.status === "confirmed");
  const decisionItem = ({ row, allocation }: SupplierBucket["decisions"][number]) => (
    <li key={allocation.allocationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <ItemName row={row} quantity={allocation.allocatedQuantity} />
      <Price price={allocation.selectedPrice} pricingQuantity={allocation.estimatedPricingQuantity} unit={row.pricingUnit} />
      <Ofertas row={row} dados={dados} supplierId={allocation.supplierId} />
      <VsUltimoPago dados={dados} productId={row.productId} supplierId={allocation.supplierId} price={allocation.selectedPrice} unit={row.pricingUnit} />
      {allocation.packagingChoiceResultEstimated !== null ? (
        <span className={allocation.packagingChoiceResultEstimated >= 0 ? "text-success text-[13px] font-medium" : "text-danger text-[13px] font-medium"}>
          embalagem {MONEY.format(allocation.packagingChoiceResultEstimated)}
        </span>
      ) : null}
      <Badge variant={allocation.status === "confirmed" ? "default" : "outline"}>{allocation.status === "confirmed" ? "no pedido" : "escolha salva"}</Badge>
      {dados.podeDecidir && allocation.status === "draft" ? <form action={cancelAllocation.bind(null, allocation.allocationId, dados.round.id)}><Button type="submit" variant="ghost" aria-label={`Desfazer a escolha de ${row.productName}`} className="text-fg-muted hover:text-destructive h-11 sm:h-9">Desfazer</Button></form> : null}
    </li>
  );

  return (
    <details id={sectionId(supplier.id)} open={defaultOpen} className="group border-border bg-surface scroll-mt-4 overflow-hidden rounded-xl border">
      <summary className="bg-surface-sunken border-border focus-visible:ring-ring/50 flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 outline-none group-open:border-b focus-visible:ring-3 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span className="border-border bg-surface rounded-lg border p-2"><Store className="text-fg-muted size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-fg font-semibold wrap-anywhere">{supplier.name}</h3>
          <p className="text-fg-muted text-[13px]">
            {countsLabel(counts)}
            {pendingCount > 0 ? (counts.confirmed > 0 ? ` · ${MONEY.format(totals.pending)} a pedir` : " · vira 1 pedido") : ""}
          </p>
        </div>
        <span className="text-right">
          <span className="text-fg block font-semibold tabular-nums">{MONEY.format(totals.total)}</span>
          {uncalculated > 0 ? <span className="text-warning block text-[13px]">{uncalculated} sem conversão</span> : null}
          {!situacao ? null : situacao.tipo === "acima" ? (
            <span className="text-warning block text-[13px] font-medium" title="Limite de compras do cadastro do fornecedor, contra o que ainda vai virar pedido. É um aviso: a decisão continua sua.">acima do limite de {MONEY.format(situacao.limite)} (+{MONEY.format(situacao.excesso)})</span>
          ) : (
            <span className="text-fg-muted block text-[13px]" title="Limite de compras do cadastro do fornecedor, contra o que ainda vai virar pedido.">{Math.round(situacao.uso * 100)}% do limite de {MONEY.format(situacao.limite)}</span>
          )}
        </span>
        <ChevronDown className="text-fg-muted size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-border divide-y">
        {drafts.map(decisionItem)}
        {supplier.recommendations.map(({ row, candidates, winner }) => (
          <li key={row.itemId} className="bg-primary/[0.025] flex flex-wrap items-center gap-3 px-4 py-3">
            <ItemName row={row} quantity={row.requestedQuantity} />
            <Price price={winner.price} pricingQuantity={winner.pricingFactor === null ? null : row.requestedQuantity * winner.pricingFactor} unit={row.pricingUnit} comparisonPrice={row.requiresPresentationComparison ? winner.comparisonPrice : null} comparisonUnit={row.comparisonUnit} best />
            <Ofertas row={row} dados={dados} supplierId={winner.id} />
            <VsUltimoPago dados={dados} productId={row.productId} supplierId={winner.id} price={winner.price} unit={row.pricingUnit} />
            <Badge variant="outline">sugestão</Badge>
            {dados.podeDecidir && dados.round.status === "active" ? <AllocateForm roundId={dados.round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} pricingUnit={row.pricingUnit} requiresPricingConversion={row.requiresPricingConversion} estimatedConversionRate={row.estimatedConversionRate} suppliers={candidates} suggestedQuantity={row.requestedQuantity} initialSupplierId={winner.id} buttonLabel="Alterar" requestedQuantity={row.requestedQuantity} decided={decidedFor(row, dados)} /> : null}
          </li>
        ))}
        {confirmed.map(decisionItem)}
      </ul>
    </details>
  );
}

/**
 * O preço desta proposta contra o último que a empresa pagou pelo mesmo
 * produto. Sem referência comparável (nunca comprado, outra unidade, pagamento
 * muito antigo), não aparece nada — um traço no lugar só pareceria dado.
 */
function VsUltimoPago({ dados, productId, supplierId, price, unit }: { dados: DadosDaAlocacao; productId: string; supplierId: string; price: number; unit: string }) {
  const comparacao = compararComUltimoPago(dados.ultimosPagos, productId, supplierId, price, unit);
  if (!comparacao) return null;
  const { diff, referencia, mesmoFornecedor } = comparacao;
  const alta = diff >= LIMITE_ALTA;
  const igual = Math.abs(diff) < LIMITE_RUIDO;
  const queda = diff <= -LIMITE_RUIDO;
  const pct = `${diff > 0 ? "+" : ""}${Math.round(diff * 100)}%`;
  const quando = new Date(referencia.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const quem = mesmoFornecedor ? "" : ` a ${dados.supplierName.get(referencia.supplierId) ?? "outro fornecedor"}`;
  return (
    <p
      className={cn("text-[13px] tabular-nums", alta ? "text-warning font-medium" : queda ? "text-success" : "text-fg-muted")}
      title={`Último pago${quem}: ${MONEY.format(referencia.price)}/${referencia.unit} em ${quando}`}
    >
      {igual ? "≈ último pago" : `${diff > 0 ? "▲" : "▼"} ${pct} vs último pago`}
      <span className="text-fg-subtle font-normal"> · {MONEY.format(referencia.price)} em {quando}{quem}</span>
    </p>
  );
}

function ItemName({ row, quantity }: { row: Row; quantity: number }) {
  return <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-[13px]">{row.groupName} · {QTY.format(quantity)} {row.purchaseUnit}</p></div>;
}

function Price({ price, pricingQuantity, unit, comparisonPrice = null, comparisonUnit = null, best = false }: { price: number; pricingQuantity: number | null; unit: string; comparisonPrice?: number | null; comparisonUnit?: string | null; best?: boolean }) {
  const hasComparison = comparisonPrice !== null && comparisonUnit !== null;
  return <div className="text-right text-sm tabular-nums"><p className={best ? "text-success font-semibold" : "text-fg"}>{MONEY.format(hasComparison ? comparisonPrice : price)} <span className="text-fg-muted text-[13px] font-normal">/{hasComparison ? comparisonUnit : unit}</span></p>{hasComparison ? <p className="text-fg-muted text-[13px]">pacote {MONEY.format(price)} / {unit}</p> : null}{pricingQuantity === null ? <p className="text-warning text-[13px]">total sem conversão</p> : <p className="text-fg-muted text-[13px]">{MONEY.format(pricingQuantity * price)}</p>}</div>;
}

function Summary({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className="border-border rounded-xl border p-3"><p className="text-fg-muted text-[13px]">{label}</p><p className={alert ? "text-warning mt-1 text-xl font-semibold tabular-nums" : "text-fg mt-1 text-xl font-semibold tabular-nums"}>{value}</p><p className="text-fg-muted text-[13px]">{detail}</p></div>;
}

function GeneratedOrders({ orders }: { orders: DadosDaAlocacao["orders"] }) {
  return (
    <section>
      <h2 className="text-fg mb-1 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4" aria-hidden /> Pedidos gerados</h2>
      <p className="text-fg-muted mb-3 text-sm">Gerar o pedido não o envia. Cada um nasce em rascunho até alguém abrir e mandar ao fornecedor.</p>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => <li key={order.id} className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"><div><Link href={`/pedidos/${order.id}`} className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline">#{order.orderNumber} · {order.supplierName}</Link><p className="text-fg-muted text-[13px]">{order.itemCount} {order.itemCount === 1 ? "item" : "itens"}{order.deliveryDueDate ? ` · entrega ${order.deliveryDueDate}` : ""}</p></div><div className="flex items-center gap-3"><Badge variant={order.status === "draft" ? "outline" : "secondary"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge><Button asChild variant="outline" className="h-11 sm:h-9"><Link href={`/pedidos/${order.id}`}>{order.status === "draft" ? "Enviar" : "Abrir"}</Link></Button></div></li>)}
      </ul>
    </section>
  );
}
