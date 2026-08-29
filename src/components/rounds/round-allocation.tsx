import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  PackageCheck,
  Sparkles,
  Store,
} from "lucide-react";
import Link from "next/link";

import { AllocateForm, ApplyRecommendationsForm, ConfirmOrdersForm } from "@/components/allocations/allocation-forms";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelAllocation } from "@/features/allocations/actions";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";
import type { DadosDaAlocacao } from "@/features/rounds/alocacao";

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
      return cell && !cell.doesNotSupply && cell.currentPrice !== null
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
  let covered = 0;

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

  for (const row of workingRows) {
    const decisions = allocationsByItem.get(row.itemId) ?? [];
    const allocated = decisions.reduce((sum, decision) => sum + decision.allocatedQuantity, 0);
    const missing = row.requestedQuantity - allocated;
    const candidates = candidatesFor(row, dados);

    for (const allocation of decisions) {
      const name = supplierName.get(allocation.supplierId) ?? "Fornecedor";
      getBucket(allocation.supplierId, name).decisions.push({ row, allocation });
    }

    if (row.commercialStatus !== "open") {
      if (missing <= 0) covered += 1;
      continue;
    }
    if (missing <= 0) covered += 1;
    else if (decisions.length > 0) partial.push({ row, missing, candidates });
    else if (candidates.length > 0) {
      const recommendation = { row, candidates, winner: candidates[0] };
      recommendations.push(recommendation);
      getBucket(recommendation.winner.id, recommendation.winner.name).recommendations.push(recommendation);
    } else withoutPrice.push(row);
  }

  const supplierBuckets = [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name));
  const decisionItemCount = workingRows.filter(
    (row) => row.commercialStatus === "open" || (allocationsByItem.get(row.itemId)?.length ?? 0) > 0,
  ).length;
  const calculableRecommendations = recommendations.filter(
    (item) => item.winner.pricingFactor !== null,
  );
  const proposalTotal = calculableRecommendations.reduce(
    (sum, item) =>
      sum +
      item.row.requestedQuantity *
        (item.winner.pricingFactor ?? 0) *
        item.winner.price,
    0,
  );
  const attentionCount = partial.length + withoutPrice.length;
  const remainingCount = attentionCount + recommendations.length;
  const totalResolved = rows.filter(isResolved).length;

  return (
    <>
      {round.status === "draft" || round.status === "cancelled" ? <p className="border-border bg-surface-sunken text-fg-muted mb-5 rounded-xl border px-4 py-3 text-sm">Esta rodada está <strong>{round.status === "draft" ? "em preparação" : "cancelada"}</strong>. Pedidos só podem ser gerados com a rodada em andamento.</p> : null}

      {orders.length > 0 && round.status === "completed" ? (
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
        <div className="border-warning/30 bg-warning/5 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="text-fg block">Os pedidos saíram, mas a rodada continua aberta</strong>
              <span className="text-fg-muted block">
                {rascunhos.length > 0
                  ? `${rascunhos.length} ${rascunhos.length === 1 ? "decisão ainda está" : "decisões ainda estão"} em rascunho.`
                  : remainingCount > 0
                    ? `${remainingCount} ${remainingCount === 1 ? "produto ainda precisa" : "produtos ainda precisam"} de decisão ou encerramento sem compra.`
                    : "Não há decisão pendente. Conclua a rodada para tirá-la do trabalho em aberto."}
              </span>
            </span>
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/compras/${round.id}#encerrar-rodada`}>
              Ver o que falta
            </Link>
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nada para decidir" description="A decisão de compra aparece quando a rodada tem itens e respostas de fornecedores." />
      ) : round.status === "active" && workingRows.length === 0 ? (
        <div className="border-success/30 bg-success-soft text-success mb-6 rounded-xl border px-4 py-5 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4" aria-hidden /> Todos os {rows.length} itens estão resolvidos
          </p>
          <p className="mt-1">
            Não há produto para decidir nesta tela. Se a rodada continuar em
            andamento, confira o encerramento na Central da Rodada.
          </p>
        </div>
      ) : (
        <>
          {round.status === "active" ? (
            <section className="border-primary/25 bg-primary/[0.035] mb-5 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-fg text-sm font-semibold">
                    {totalResolved} de {rows.length} itens fechados
                  </p>
                  <p className="text-fg-muted mt-0.5 text-xs">
                    Abaixo aparecem somente os {workingRows.length} que ainda
                    precisam de decisão ou confirmação.
                  </p>
                </div>
                <Badge variant="outline">{workingRows.length} pendentes</Badge>
              </div>
              <div className="bg-surface-muted mt-3 h-1.5 overflow-hidden rounded-full">
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
                <p className="text-fg-muted text-sm">O menor preço vigente fica pré-selecionado. Revise as exceções e aplique as sugestões ao rascunho.</p>
              </div>
              {podeDecidir && round.status === "active" && recommendations.length > 0 ? <ApplyRecommendationsForm roundId={round.id} itemCount={recommendations.length} /> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Cobertos" value={`${covered}/${decisionItemCount}`} detail="quantidade já decidida" />
              <Summary label="Sugestões" value={String(recommendations.length)} detail="menores preços disponíveis" />
              <Summary label="Total sugerido" value={MONEY.format(proposalTotal)} detail={`${calculableRecommendations.length}/${recommendations.length} sugestões calculáveis`} alert={calculableRecommendations.length < recommendations.length} />
              <Summary label="Atenção" value={String(attentionCount)} detail="sem preço ou incompletos" alert={attentionCount > 0} />
            </div>
          </section>
          )}

          {round.status === "completed" ? (
            <CompletedRoundResult dados={dados} />
          ) : (
            <div className="mb-6 space-y-3">
              {supplierBuckets.map((supplier) => <SupplierSection key={supplier.id} supplier={supplier} dados={dados} />)}
            </div>
          )}

          {round.status !== "completed" && attentionCount > 0 ? (
            <section className="border-warning/30 bg-warning/5 mb-6 rounded-xl border p-4">
              <h2 className="text-fg flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="text-warning size-4" aria-hidden /> Exceções para revisar</h2>
              <div className="mt-3 space-y-3">
                {partial.map(({ row, missing, candidates }) => (
                  <div key={row.itemId} className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-xs">Faltam {QTY.format(missing)} {row.purchaseUnit} para cobrir</p></div>
                    {podeDecidir && candidates.length > 0 && round.status === "active" ? <AllocateForm roundId={round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} pricingUnit={row.pricingUnit} requiresPricingConversion={row.requiresPricingConversion} estimatedConversionRate={row.estimatedConversionRate} suppliers={candidates} suggestedQuantity={missing} initialSupplierId={candidates[0].id} buttonLabel="Completar" /> : null}
                  </div>
                ))}
                {withoutPrice.map((row) => <div key={row.itemId} className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"><div className="flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-xs">Nenhum fornecedor respondeu com preço</p></div><Badge variant="destructive">sem preço</Badge></div>)}
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

      {podeConfirmar && rascunhos.length > 0 && round.status === "active" ? <div className="mb-8"><ConfirmOrdersForm roundId={round.id} draftCount={rascunhos.length} supplierCount={fornecedoresNoRascunho.size} /></div> : null}
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
              <p className="text-fg-subtle text-xs">valor estimado adjudicado</p>
              {supplier.uncalculatedWins > 0 ? (
                <p className="text-warning mt-1 text-xs">
                  {supplier.uncalculatedWins} {supplier.uncalculatedWins === 1 ? "item sem conversão" : "itens sem conversão"}
                </p>
              ) : null}
              <div className="text-fg-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
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
                <ChevronDown className="text-fg-subtle size-4" aria-hidden />
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
          <p className="text-fg-subtle text-xs">
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
                <p className="text-fg min-w-0 text-xs font-semibold wrap-anywhere">
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
                  <p className="text-fg-muted text-xs">
                    {QTY.format(wonQuantity)} {row.purchaseUnit} adjudicados
                  </p>
                  {cell?.negotiated && cell.quotedPrice !== null ? (
                    <p className="text-fg-subtle text-xs line-through tabular-nums">
                      Original: {MONEY.format(cell.quotedPrice)}
                    </p>
                  ) : null}
                </>
              ) : cell?.doesNotSupply ? (
                <p className="text-fg-subtle mt-1 text-xs">Não fornece</p>
              ) : cell?.isAvailable === false ? (
                <p className="text-fg-subtle mt-1 text-xs">
                  Sem disponibilidade nesta cotação
                </p>
              ) : hasPrice ? (
                <>
                  <p className="text-fg mt-1 text-sm font-semibold tabular-nums">
                    {MONEY.format(cell.currentPrice ?? 0)} / {row.pricingUnit}
                  </p>
                  {cell?.negotiated && cell.quotedPrice !== null ? (
                    <p className="text-fg-subtle text-xs line-through tabular-nums">
                      Original: {MONEY.format(cell.quotedPrice)}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-fg-subtle mt-1 text-xs">Sem preço informado</p>
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
          <Button asChild size="sm" variant="outline">
            <Link href={`/compras/${dados.round.id}/relatorio`}>
              Abrir relatório gerencial
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label="Itens cotados" value={String(dados.rows.length)} detail={withoutPurchase > 0 ? `${withoutPurchase} encerrados sem compra` : "escopo concluído"} />
        <Summary label="Fornecedores vencedores" value={String(suppliers.size)} detail={[...suppliers].map((id) => dados.supplierName.get(id)).filter(Boolean).join(", ") || "nenhum"} />
        <Summary label="Valor estimado" value={MONEY.format(estimatedTotal)} detail={`${calculableItems}/${purchasedItems} itens calculáveis`} alert={calculableItems < purchasedItems} />
        <Summary label="Economia negociada" value={MONEY.format(negotiatedSavings)} detail="preço original x adjudicado" />
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
        <span className="text-fg-muted text-xs font-normal">Consultar</span>
        <ChevronDown className="text-fg-subtle size-4" aria-hidden />
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
                <p className="text-fg-subtle text-xs">
                  {row.groupName} · {QTY.format(row.requestedQuantity)} {row.purchaseUnit}
                </p>
              </div>
              <div className="text-fg-muted text-xs">
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

function SupplierSection({ supplier, dados }: { supplier: SupplierBucket; dados: DadosDaAlocacao }) {
  const total = supplier.recommendations.reduce(
    (sum, item) =>
      sum +
      (item.winner.pricingFactor === null
        ? 0
        : item.row.requestedQuantity *
          item.winner.pricingFactor *
          item.winner.price),
    0,
  ) + supplier.decisions.reduce(
    (sum, item) =>
      sum +
      (item.allocation.estimatedPricingQuantity ?? 0) *
        item.allocation.selectedPrice,
    0,
  );
  const itemCount = supplier.decisions.length + supplier.recommendations.length;
  const uncalculated =
    supplier.recommendations.filter(
      (item) => item.winner.pricingFactor === null,
    ).length +
    supplier.decisions.filter(
      (item) => item.allocation.estimatedPricingQuantity === null,
    ).length;
  return (
    <section className="border-border bg-surface overflow-hidden rounded-xl border">
      <header className="bg-surface-sunken border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className="border-border bg-surface rounded-lg border p-2"><Store className="text-fg-muted size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1"><h3 className="text-fg font-semibold">{supplier.name}</h3><p className="text-fg-muted text-xs">{itemCount} {itemCount === 1 ? "item" : "itens"} · futuro pedido agrupado</p></div>
        <span className="text-right">
          <span className="text-fg block font-semibold tabular-nums">{MONEY.format(total)}</span>
          {uncalculated > 0 ? <span className="text-warning block text-[11px]">{uncalculated} sem conversão</span> : null}
        </span>
      </header>
      <ul className="divide-border divide-y">
        {supplier.decisions.map(({ row, allocation }) => (
          <li key={allocation.allocationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ItemName row={row} quantity={allocation.allocatedQuantity} />
            <Price price={allocation.selectedPrice} pricingQuantity={allocation.estimatedPricingQuantity} unit={row.pricingUnit} />
            <Badge variant={allocation.status === "confirmed" ? "default" : "outline"}>{allocation.status === "confirmed" ? "confirmada" : "rascunho"}</Badge>
            {dados.podeDecidir && allocation.status === "draft" ? <form action={cancelAllocation.bind(null, allocation.allocationId, dados.round.id)}><Button type="submit" size="sm" variant="ghost" className="text-fg-subtle hover:text-destructive">Desfazer</Button></form> : null}
          </li>
        ))}
        {supplier.recommendations.map(({ row, candidates, winner }) => (
          <li key={row.itemId} className="bg-primary/[0.025] flex flex-wrap items-center gap-3 px-4 py-3">
            <ItemName row={row} quantity={row.requestedQuantity} />
            <Price price={winner.price} pricingQuantity={winner.pricingFactor === null ? null : row.requestedQuantity * winner.pricingFactor} unit={row.pricingUnit} best />
            <Badge variant="secondary">melhor preço · sugestão</Badge>
            {dados.podeDecidir && dados.round.status === "active" ? <AllocateForm roundId={dados.round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} pricingUnit={row.pricingUnit} requiresPricingConversion={row.requiresPricingConversion} estimatedConversionRate={row.estimatedConversionRate} suppliers={candidates} suggestedQuantity={row.requestedQuantity} initialSupplierId={winner.id} buttonLabel="Revisar escolha" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemName({ row, quantity }: { row: Row; quantity: number }) {
  return <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-subtle text-xs">{row.groupName} · {QTY.format(quantity)} {row.purchaseUnit}</p></div>;
}

function Price({ price, pricingQuantity, unit, best = false }: { price: number; pricingQuantity: number | null; unit: string; best?: boolean }) {
  return <div className="text-right text-sm tabular-nums"><p className={best ? "text-success font-semibold" : "text-fg"}>{MONEY.format(price)} <span className="text-fg-subtle text-xs font-normal">/{unit}</span></p>{pricingQuantity === null ? <p className="text-warning text-xs">total sem conversão</p> : <p className="text-fg-muted text-xs">{MONEY.format(pricingQuantity * price)}</p>}</div>;
}

function Summary({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className="border-border rounded-xl border p-3"><p className="text-fg-muted text-xs">{label}</p><p className={alert ? "text-warning mt-1 text-xl font-semibold tabular-nums" : "text-fg mt-1 text-xl font-semibold tabular-nums"}>{value}</p><p className="text-fg-subtle text-xs">{detail}</p></div>;
}

function GeneratedOrders({ orders }: { orders: DadosDaAlocacao["orders"] }) {
  return (
    <section>
      <h2 className="text-fg mb-1 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4" aria-hidden /> Pedidos gerados</h2>
      <p className="text-fg-muted mb-3 text-sm">Gerar o pedido não o envia. Cada um nasce em rascunho até alguém abrir e mandar ao fornecedor.</p>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => <li key={order.id} className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"><div><Link href={`/pedidos/${order.id}`} className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline">#{order.orderNumber} · {order.supplierName}</Link><p className="text-fg-subtle text-xs">{order.itemCount} {order.itemCount === 1 ? "item" : "itens"}{order.deliveryDueDate ? ` · entrega ${order.deliveryDueDate}` : ""}</p></div><div className="flex items-center gap-3"><span className="text-fg font-medium tabular-nums">{MONEY.format(order.total)}</span><Badge variant={order.status === "draft" ? "outline" : "secondary"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge><Button asChild size="sm" variant="outline"><Link href={`/pedidos/${order.id}`}>{order.status === "draft" ? "Enviar" : "Abrir"}</Link></Button></div></li>)}
      </ul>
    </section>
  );
}
