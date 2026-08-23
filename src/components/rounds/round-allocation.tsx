import { AlertTriangle, CheckCircle2, PackageCheck, Sparkles, Store } from "lucide-react";
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
type Candidate = { id: string; name: string; price: number };
type Recommendation = { row: Row; candidates: Candidate[]; winner: Candidate };
type SupplierBucket = {
  id: string;
  name: string;
  recommendations: Recommendation[];
  decisions: { row: Row; allocation: Allocation }[];
};

function candidatesFor(row: Row, dados: DadosDaAlocacao): Candidate[] {
  return dados.suppliers
    .filter((supplier) => supplier.removed_at === null)
    .flatMap((supplier) => {
      const cell = row.cells.get(supplier.id);
      return cell && !cell.doesNotSupply && cell.currentPrice !== null
        ? [{ id: supplier.supplier_id, name: supplier.suppliers.name, price: cell.currentPrice }]
        : [];
    })
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/** A proposta é automática, mas só vira rascunho depois de uma ação explícita. */
export function AlocacaoConteudo({ dados }: { dados: DadosDaAlocacao }) {
  const { round, rows, allocationsByItem, orders, rascunhos, fornecedoresNoRascunho, supplierName, podeVer, podeDecidir, podeConfirmar } = dados;

  if (!podeVer) {
    return <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">Seu papel não permite ver a decisão de compra desta rodada.</p>;
  }

  const buckets = new Map<string, SupplierBucket>();
  const recommendations: Recommendation[] = [];
  const partial: { row: Row; missing: number; candidates: Candidate[] }[] = [];
  const withoutPrice: Row[] = [];
  let covered = 0;

  const getBucket = (id: string, name: string) => {
    const current = buckets.get(id) ?? { id, name, recommendations: [], decisions: [] };
    buckets.set(id, current);
    return current;
  };

  for (const row of rows) {
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
  const decisionItemCount = rows.filter(
    (row) => row.commercialStatus === "open" || (allocationsByItem.get(row.itemId)?.length ?? 0) > 0,
  ).length;
  const proposalTotal = recommendations.reduce((sum, item) => sum + item.row.requestedQuantity * item.winner.price, 0);
  const proposalSavings = recommendations.reduce((sum, item) => {
    const highest = item.candidates.at(-1)?.price ?? item.winner.price;
    return sum + (highest - item.winner.price) * item.row.requestedQuantity;
  }, 0);
  const attentionCount = partial.length + withoutPrice.length;

  return (
    <>
      {round.status !== "active" ? <p className="border-border bg-surface-sunken text-fg-muted mb-5 rounded-xl border px-4 py-3 text-sm">Esta rodada está em <strong>{round.status}</strong>. Pedidos só podem ser gerados com a rodada em andamento.</p> : null}

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nada para decidir" description="A decisão de compra aparece quando a rodada tem itens e respostas de fornecedores." />
      ) : (
        <>
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
              <Summary label="Total sugerido" value={MONEY.format(proposalTotal)} detail="antes de aplicar" />
              <Summary label="Atenção" value={String(attentionCount)} detail="sem preço ou incompletos" alert={attentionCount > 0} />
            </div>
            {proposalSavings > 0 && recommendations.length > 0 ? <p className="text-success mt-2 text-xs font-medium">Economia potencial de {MONEY.format(proposalSavings)} frente aos maiores preços recebidos para esses itens.</p> : null}
          </section>

          <div className="mb-6 space-y-3">
            {supplierBuckets.map((supplier) => <SupplierSection key={supplier.id} supplier={supplier} dados={dados} />)}
          </div>

          {attentionCount > 0 ? (
            <section className="border-warning/30 bg-warning/5 mb-6 rounded-xl border p-4">
              <h2 className="text-fg flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="text-warning size-4" aria-hidden /> Exceções para revisar</h2>
              <div className="mt-3 space-y-3">
                {partial.map(({ row, missing, candidates }) => (
                  <div key={row.itemId} className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-xs">Faltam {QTY.format(missing)} {row.purchaseUnit} para cobrir</p></div>
                    {podeDecidir && candidates.length > 0 && round.status === "active" ? <AllocateForm roundId={round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} suppliers={candidates} suggestedQuantity={missing} initialSupplierId={candidates[0].id} buttonLabel="Completar" /> : null}
                  </div>
                ))}
                {withoutPrice.map((row) => <div key={row.itemId} className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"><div className="flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-muted text-xs">Nenhum fornecedor respondeu com preço</p></div><Badge variant="destructive">sem preço</Badge></div>)}
              </div>
            </section>
          ) : null}
        </>
      )}

      {podeConfirmar && rascunhos.length > 0 && round.status === "active" ? <div className="mb-8"><ConfirmOrdersForm roundId={round.id} draftCount={rascunhos.length} supplierCount={fornecedoresNoRascunho.size} /></div> : null}
      {orders.length > 0 ? <GeneratedOrders orders={orders} /> : null}
    </>
  );
}

function SupplierSection({ supplier, dados }: { supplier: SupplierBucket; dados: DadosDaAlocacao }) {
  const total = supplier.recommendations.reduce((sum, item) => sum + item.row.requestedQuantity * item.winner.price, 0) + supplier.decisions.reduce((sum, item) => sum + item.allocation.allocatedQuantity * item.allocation.selectedPrice, 0);
  const itemCount = supplier.decisions.length + supplier.recommendations.length;
  return (
    <section className="border-border bg-surface overflow-hidden rounded-xl border">
      <header className="bg-surface-sunken border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className="border-border bg-surface rounded-lg border p-2"><Store className="text-fg-muted size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1"><h3 className="text-fg font-semibold">{supplier.name}</h3><p className="text-fg-muted text-xs">{itemCount} {itemCount === 1 ? "item" : "itens"} · futuro pedido agrupado</p></div>
        <span className="text-fg font-semibold tabular-nums">{MONEY.format(total)}</span>
      </header>
      <ul className="divide-border divide-y">
        {supplier.decisions.map(({ row, allocation }) => (
          <li key={allocation.allocationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ItemName row={row} quantity={allocation.allocatedQuantity} />
            <Price price={allocation.selectedPrice} quantity={allocation.allocatedQuantity} unit={row.pricingUnit} />
            <Badge variant={allocation.status === "confirmed" ? "default" : "outline"}>{allocation.status === "confirmed" ? "confirmada" : "rascunho"}</Badge>
            {dados.podeDecidir && allocation.status === "draft" ? <form action={cancelAllocation.bind(null, allocation.allocationId, dados.round.id)}><Button type="submit" size="sm" variant="ghost" className="text-fg-subtle hover:text-destructive">Desfazer</Button></form> : null}
          </li>
        ))}
        {supplier.recommendations.map(({ row, candidates, winner }) => (
          <li key={row.itemId} className="bg-primary/[0.025] flex flex-wrap items-center gap-3 px-4 py-3">
            <ItemName row={row} quantity={row.requestedQuantity} />
            <Price price={winner.price} quantity={row.requestedQuantity} unit={row.pricingUnit} best />
            <Badge variant="secondary">melhor preço · sugestão</Badge>
            {dados.podeDecidir && dados.round.status === "active" ? <AllocateForm roundId={dados.round.id} quotationItemId={row.itemId} productName={row.productName} purchaseUnit={row.purchaseUnit} suppliers={candidates} suggestedQuantity={row.requestedQuantity} initialSupplierId={winner.id} buttonLabel="Revisar escolha" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemName({ row, quantity }: { row: Row; quantity: number }) {
  return <div className="min-w-48 flex-1"><p className="text-fg text-sm font-medium">{row.productName}</p><p className="text-fg-subtle text-xs">{row.groupName} · {QTY.format(quantity)} {row.purchaseUnit}</p></div>;
}

function Price({ price, quantity, unit, best = false }: { price: number; quantity: number; unit: string; best?: boolean }) {
  return <div className="text-right text-sm tabular-nums"><p className={best ? "text-success font-semibold" : "text-fg"}>{MONEY.format(price)} <span className="text-fg-subtle text-xs font-normal">/{unit}</span></p><p className="text-fg-muted text-xs">{MONEY.format(quantity * price)}</p></div>;
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
