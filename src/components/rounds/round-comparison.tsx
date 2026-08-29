"use client";

import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Search, Store } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { CorrectionForm } from "@/components/quotations/correction-form";
import { ManualPriceForm } from "@/components/quotations/manual-price-form";
import { NegotiationForm } from "@/components/quotations/negotiation-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { DadosDaComparacao } from "@/features/rounds/comparacao";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const NORMALIZED = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

type Filter = "all" | "above" | "missing" | "best";
type Supplier = DadosDaComparacao["suppliers"][number];
type Row = DadosDaComparacao["rows"][number];

function supplierStats(supplier: Supplier, rows: Row[]) {
  let priced = 0;
  let best = 0;
  let missing = 0;
  let unavailable = 0;
  for (const row of rows) {
    const cell = row.cells.get(supplier.id);
    if (cell?.currentPrice !== null && cell?.currentPrice !== undefined && !cell.doesNotSupply) {
      priced += 1;
      if (cell.currentPrice === row.bestPrice) best += 1;
    } else if (cell?.doesNotSupply || cell?.isAvailable === false) unavailable += 1;
    else missing += 1;
  }
  return { priced, best, missing, unavailable };
}

/**
 * Comparação focada: um fornecedor por vez contra a melhor referência.
 * A matriz completa deixa de ser o caminho principal, eliminando a associação
 * frágil entre uma ação e um cabeçalho distante depois do scroll horizontal.
 */
export function ComparacaoConteudo({ dados }: { dados: DadosDaComparacao }) {
  const { rows, suppliers } = dados;
  const [supplierId, setSupplierId] = React.useState(
    () => suppliers.find((supplier) => supplier.removed_at === null)?.id ?? suppliers[0]?.id ?? "",
  );
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  const [supplierPanelOpen, setSupplierPanelOpen] = React.useState(false);

  if (rows.length === 0 || suppliers.length === 0) {
    return <EmptyState icon={BarChart3} title="Nada para comparar ainda" description="A comparação aparece quando a rodada tem itens e fornecedores convidados." />;
  }

  const currentIndex = Math.max(0, suppliers.findIndex((supplier) => supplier.id === supplierId));
  const supplier = suppliers[currentIndex] ?? suppliers[0];
  const stats = supplierStats(supplier, rows);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visibleRows = rows.filter((row) => {
    if (normalizedSearch && !`${row.productName} ${row.groupName}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) return false;
    const cell = row.cells.get(supplier.id);
    const hasPrice = cell?.currentPrice !== null && cell?.currentPrice !== undefined && !cell.doesNotSupply;
    const isBest = hasPrice && cell.currentPrice === row.bestPrice;
    if (filter === "above") return hasPrice && !isBest;
    if (filter === "missing") return !hasPrice && !cell?.doesNotSupply && cell?.isAvailable !== false;
    if (filter === "best") return isBest;
    return true;
  });

  const move = (direction: -1 | 1) => {
    const next = (currentIndex + direction + suppliers.length) % suppliers.length;
    setSupplierId(suppliers[next].id);
    setSupplierPanelOpen(false);
  };

  const selectSupplier = (nextSupplierId: string) => {
    setSupplierId(nextSupplierId);
    setSupplierPanelOpen(false);
  };

  return (
    <div className="space-y-4">
      <section className="border-primary/30 bg-surface sticky top-0 z-20 rounded-xl border shadow-sm">
        <button
          type="button"
          aria-expanded={supplierPanelOpen}
          aria-controls="comparison-supplier-panel"
          onClick={() => setSupplierPanelOpen((open) => !open)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2.5 text-left md:hidden",
            supplierPanelOpen && "border-primary/20 border-b",
          )}
        >
          <span className="bg-primary/10 rounded-lg p-2">
            <Store className="text-primary size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-fg-muted block text-[11px]">
              Fornecedor em análise · {currentIndex + 1} de {suppliers.length}
            </span>
            <strong className="text-fg block truncate text-sm">
              {supplier.suppliers.name} · {stats.priced}/{rows.length} preços
            </strong>
          </span>
          {stats.missing > 0 ? (
            <Badge variant="destructive" className="shrink-0">
              {stats.missing} pendentes
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              completo
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "text-fg-subtle size-4 shrink-0 transition-transform",
              supplierPanelOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        <div
          id="comparison-supplier-panel"
          className={cn(supplierPanelOpen ? "block" : "hidden md:block")}
        >
        <div className="flex flex-wrap items-center gap-3 p-3">
          <span className="bg-primary/10 hidden rounded-lg p-2 md:inline-flex"><Store className="text-primary size-4" aria-hidden /></span>
          <div className="min-w-0 flex-1 md:min-w-52">
            <label htmlFor="comparison-supplier" className="text-fg-muted mb-1 block text-xs font-medium">Fornecedor em análise · {currentIndex + 1} de {suppliers.length}</label>
            <ThemedSelect
              id="comparison-supplier"
              value={supplier.id}
              onValueChange={selectSupplier}
              className="h-9 max-w-md font-semibold"
              options={suppliers.map((option) => {
                const optionStats = supplierStats(option, rows);
                return {
                  value: option.id,
                  label: `${option.suppliers.name} · ${optionStats.priced}/${rows.length} preços${option.removed_at ? " · retirado" : ""}`,
                };
              })}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" aria-label="Fornecedor anterior" onClick={() => move(-1)}><ChevronLeft className="size-4" aria-hidden /></Button>
            <Button type="button" size="sm" variant="outline" aria-label="Próximo fornecedor" onClick={() => move(1)}><ChevronRight className="size-4" aria-hidden /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{stats.priced} preços</Badge>
            <Badge variant="outline">{stats.best} melhores</Badge>
            {stats.unavailable > 0 ? <Badge variant="outline">{stats.unavailable} indisponíveis</Badge> : null}
            {stats.missing > 0 ? <Badge variant="destructive">{stats.missing} pendentes</Badge> : null}
            {supplier.completed_at ? <Badge>resposta concluída</Badge> : <Badge variant="outline">não concluiu</Badge>}
          </div>
        </div>
        <div className="border-primary/20 bg-primary/[0.035] border-t px-3 py-2">
          <p className="text-fg-muted text-xs">Todas as ações abaixo alteram a resposta de <strong className="text-fg">{supplier.suppliers.name}</strong>.</p>
        </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto ou grupo" className="pl-8" />
        </div>
        {(["all", "above", "missing", "best"] as const).map((value) => (
          <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {value === "all" ? `Todos (${rows.length})` : value === "above" ? "Acima do melhor" : value === "missing" ? "Sem preço" : "Melhores"}
          </Button>
        ))}
      </div>

      <div key={supplier.id} className="space-y-2">
        {visibleRows.map((row) => <ComparisonRow key={row.itemId} row={row} supplier={supplier} dados={dados} />)}
        {visibleRows.length === 0 ? <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">Nenhum produto corresponde a este filtro.</p> : null}
      </div>

      <div className="border-border bg-surface-sunken rounded-xl border p-3 text-xs">
        <p className="text-fg-muted">O valor de referência é o menor preço vigente da rodada. Uma negociação preserva o preço original no histórico.</p>
        {rows.some((row) => row.conversionName) ? <p className="text-fg-subtle mt-1">Quando existe conversão de embalagem, o preço normalizado também aparece para evitar comparar apresentações diferentes como se fossem iguais.</p> : null}
      </div>
    </div>
  );
}

function ComparisonRow({ row, supplier, dados }: { row: Row; supplier: Supplier; dados: DadosDaComparacao }) {
  const cell = row.cells.get(supplier.id);
  const bestSuppliers = dados.suppliers.filter((candidate) => {
    const candidateCell = row.cells.get(candidate.id);
    return row.bestPrice !== null && candidateCell?.currentPrice === row.bestPrice && !candidateCell.doesNotSupply;
  });
  const currentPrice = cell?.currentPrice ?? null;
  const hasPrice = currentPrice !== null && !cell?.doesNotSupply;
  const isBest = hasPrice && currentPrice === row.bestPrice;
  const difference = hasPrice && row.bestPrice !== null && row.bestPrice > 0 ? ((currentPrice - row.bestPrice) / row.bestPrice) * 100 : null;

  return (
    <article className="border-border bg-surface grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(15rem,1fr)_minmax(12rem,.8fr)]">
      <div>
        <h3 className="text-fg text-sm font-semibold">{row.productName}</h3>
        <p className="text-fg-subtle mt-0.5 text-xs">{row.groupName} · {QTY.format(row.requestedQuantity)} {row.purchaseUnit} · preço por {row.pricingUnit}</p>
        {row.conversionName ? <Badge variant="outline" className="mt-2">comparar apresentação</Badge> : null}
      </div>

      <div className="border-border lg:border-l lg:pl-3">
        <p className="text-fg-muted mb-1 text-xs font-medium">Proposta de {supplier.suppliers.name}</p>
        <SupplierOffer row={row} supplier={supplier} cell={cell} dados={dados} />
      </div>

      <div className="border-border lg:border-l lg:pl-3">
        <p className="text-fg-muted mb-1 text-xs font-medium">Melhor referência</p>
        {row.bestPrice === null ? <span className="text-fg-subtle text-sm">Nenhum preço recebido</span> : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-fg font-semibold tabular-nums">R$ {MONEY.format(row.bestPrice)}</span>
              {isBest ? <Badge variant="secondary">este fornecedor</Badge> : null}
            </div>
            <p className="text-fg-subtle mt-0.5 text-xs">{bestSuppliers.map((best) => best.suppliers.name).join(", ")}</p>
            {difference !== null && !isBest ? <Badge variant="destructive" className="mt-2">+{PERCENT.format(difference)}% acima</Badge> : null}
          </>
        )}
      </div>
    </article>
  );
}

function SupplierOffer({ row, supplier, cell, dados }: { row: Row; supplier: Supplier; cell: Row["cells"] extends Map<string, infer C> ? C | undefined : never; dados: DadosDaComparacao }) {
  if (!cell) return <p className="text-fg-subtle text-sm">Este item não foi enviado ao fornecedor.</p>;

  if (cell.doesNotSupply) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline">não fornece</Badge>{cell.correctionCount > 0 ? <Badge variant="outline">corrigido</Badge> : null}</div>
        {cell.notes ? <p className="text-fg-muted mt-1 text-xs">{cell.notes}</p> : null}
        {dados.podeCorrigir && cell.responseItemId ? <CorrectionForm responseItemId={cell.responseItemId} roundId={dados.round.id} currentPrice={cell.currentPrice} doesNotSupply supplierName={supplier.suppliers.name} productName={row.productName} pricingUnit={row.pricingUnit} /> : null}
      </div>
    );
  }

  if (cell.isAvailable === false) {
    return (
      <div>
        <Badge variant="outline">sem disponibilidade nesta cotação</Badge>
        {cell.notes ? <p className="text-fg-muted mt-1 text-xs">{cell.notes}</p> : null}
      </div>
    );
  }

  if (cell.responseItemId === null) {
    const link = row.supplierQuotationItemBySupplier.get(supplier.id);
    return <div><Badge variant="destructive">aguardando preço</Badge>{dados.podeLancar && link ? <ManualPriceForm supplierQuotationItemId={link} roundId={dados.round.id} supplierName={supplier.suppliers.name} productName={row.productName} pricingUnit={row.pricingUnit} /> : null}</div>;
  }

  if (cell.currentPrice === null) return <Badge variant="destructive">resposta sem preço</Badge>;

  const best = row.bestPrice !== null && cell.currentPrice === row.bestPrice;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={best ? "text-success text-base font-semibold tabular-nums" : "text-fg text-base font-semibold tabular-nums"}>R$ {MONEY.format(cell.currentPrice)}</span>
        {best ? <Badge variant="secondary">melhor</Badge> : null}
        {cell.correctionCount > 0 ? <Badge variant="outline">corrigido</Badge> : null}
      </div>
      {cell.negotiated && cell.quotedPrice !== null ? <p className="text-fg-subtle text-xs line-through tabular-nums">Original: R$ {MONEY.format(cell.quotedPrice)}</p> : null}
      {cell.normalizedPrice !== null ? <p className={row.bestNormalized !== null && cell.normalizedPrice === row.bestNormalized ? "text-success text-xs font-medium tabular-nums" : "text-fg-muted text-xs tabular-nums"}>= {NORMALIZED.format(cell.normalizedPrice)} / {row.comparisonUnit}</p> : null}
      {cell.attributes.length > 0 ? <p className="text-fg-subtle mt-1 text-xs">{cell.attributes.map((attribute) => `${attribute.name}: ${attribute.value}`).join(" · ")}</p> : null}
      {cell.notes ? <p className="text-fg-muted mt-1 text-xs">{cell.notes}</p> : null}
      <div className="mt-1 flex flex-wrap items-start gap-1">
        {dados.podeNegociar ? <NegotiationForm responseItemId={cell.responseItemId} roundId={dados.round.id} currentPrice={cell.currentPrice} supplierName={supplier.suppliers.name} productName={row.productName} /> : null}
        {dados.podeCorrigir ? <CorrectionForm responseItemId={cell.responseItemId} roundId={dados.round.id} currentPrice={cell.currentPrice} doesNotSupply={false} supplierName={supplier.suppliers.name} productName={row.productName} pricingUnit={row.pricingUnit} /> : null}
      </div>
    </div>
  );
}
