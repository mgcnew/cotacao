"use client";

import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Search,
  Store,
} from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { CorrectionForm } from "@/components/quotations/correction-form";
import { ManualPriceForm } from "@/components/quotations/manual-price-form";
import { NegotiationForm } from "@/components/quotations/negotiation-form";
import {
  NegotiationReferenceDialog,
  type NegotiationReferenceCandidate,
} from "@/components/quotations/negotiation-reference-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { DadosDaComparacao } from "@/features/rounds/comparacao";
import { formatUnitPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

type Supplier = DadosDaComparacao["suppliers"][number];
type Row = DadosDaComparacao["rows"][number];
type Cell = Row["cells"] extends Map<string, infer C> ? C : never;

/**
 * Onde a resposta de um fornecedor para um item cai na tela.
 *
 * `notSent` é a ausência de célula: o item nunca foi enviado a este fornecedor.
 * Não é pendência — não há nada que ele ou o comprador possa fazer —, então não
 * entra em "sem preço".
 */
type Kind = "best" | "above" | "missing" | "unavailable" | "notSent";
type Filter = "all" | Exclude<Kind, "notSent">;

function comparablePrice(row: Row, cell: Cell | undefined) {
  return row.usesNormalizedComparison
    ? (cell?.normalizedPrice ?? null)
    : (cell?.currentPrice ?? null);
}

function classify(row: Row, supplierId: string): Kind {
  const cell = row.cells.get(supplierId);
  if (!cell) return "notSent";
  if (cell.doesNotSupply || cell.isAvailable === false) return "unavailable";
  if (cell.currentPrice === null) return "missing";
  const own = comparablePrice(row, cell);
  // `null === null` não é empate: sem preço comparável não há "melhor".
  return own !== null && own === row.bestComparablePrice ? "best" : "above";
}

function supplierStats(supplier: Supplier, rows: Row[]) {
  let priced = 0;
  let best = 0;
  let missing = 0;
  let unavailable = 0;
  for (const row of rows) {
    const kind = classify(row, supplier.id);
    if (kind === "best") {
      priced += 1;
      best += 1;
    } else if (kind === "above") priced += 1;
    else if (kind === "unavailable") unavailable += 1;
    else if (kind === "missing") missing += 1;
  }
  return { priced, best, missing, unavailable };
}

/**
 * Quanto custa a diferença para a melhor referência.
 *
 * `total` só existe quando a quantidade pedida está na mesma unidade do preço e
 * a comparação não é por apresentação; fora disso multiplicar daria um número
 * que parece certo e não é.
 */
function gap(row: Row, cell: Cell | undefined) {
  const own = comparablePrice(row, cell);
  const best = row.bestComparablePrice;
  if (own === null || best === null || own <= best) return null;
  const unit = own - best;
  const sameUnit = !row.usesNormalizedComparison && row.purchaseUnit === row.pricingUnit;
  return {
    unit,
    percent: best > 0 ? (unit / best) * 100 : null,
    total: sameUnit ? unit * row.requestedQuantity : null,
  };
}

const priceText = (row: Row, value: number) =>
  row.usesNormalizedComparison ? formatUnitPrice(value) : MONEY.format(value);
const unitText = (row: Row) =>
  row.usesNormalizedComparison ? (row.comparisonUnit ?? "un") : row.pricingUnit;

const FILTER_LABEL: Record<Filter, string> = {
  all: "Todos",
  best: "Melhores",
  above: "Acima do melhor",
  missing: "Sem preço",
  unavailable: "Indisponíveis",
};

const COLUMNS = "@2xl:grid-cols-[minmax(11rem,1.1fr)_minmax(14rem,1.1fr)_minmax(12rem,1fr)]";

/**
 * Comparação focada: um fornecedor por vez contra a melhor referência.
 * A matriz completa deixa de ser o caminho principal, eliminando a associação
 * frágil entre uma ação e um cabeçalho distante depois do scroll horizontal.
 *
 * O layout de tabela responde à largura do próprio contêiner (`@container`), e
 * não à da janela: a mesma tela abre também dentro do modal da rodada.
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
  const negotiationCandidates = rows.flatMap((row) => {
    const ownCell = row.cells.get(supplier.id);
    if (
      !ownCell?.responseItemId ||
      ownCell.currentPrice === null ||
      ownCell.doesNotSupply ||
      ownCell.isAvailable === false
    ) {
      return [];
    }
    const competitorPrices = suppliers.flatMap((candidate) => {
      if (candidate.id === supplier.id || candidate.removed_at !== null) return [];
      const candidateCell = row.cells.get(candidate.id);
      const price = comparablePrice(row, candidateCell);
      return price !== null && !candidateCell?.doesNotSupply && candidateCell?.isAvailable !== false
        ? [price]
        : [];
    });
    return [
      {
        responseItemId: ownCell.responseItemId,
        productName: row.productName,
        requestedQuantity: row.requestedQuantity,
        purchaseUnit: row.purchaseUnit,
        pricingUnit: row.pricingUnit,
        currentPrice: ownCell.currentPrice,
        bestCompetitorPrice:
          competitorPrices.length > 0 ? Math.min(...competitorPrices) : null,
        referenceUnit:
          row.usesNormalizedComparison && row.comparisonUnit
            ? row.comparisonUnit
            : row.pricingUnit,
        useComparisonUnit: row.usesNormalizedComparison,
      } satisfies NegotiationReferenceCandidate,
    ];
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const matchesSearch = (row: Row) =>
    !normalizedSearch ||
    `${row.productName} ${row.groupName}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);

  const counts: Record<Filter, number> = { all: 0, best: 0, above: 0, missing: 0, unavailable: 0 };
  let notSentCount = 0;
  // Total cotado e quanto sobraria ao igualar a melhor referência, só onde a
  // conta é honesta (mesma unidade de compra e de preço, sem apresentação).
  let comparableItems = 0;
  let offerTotal = 0;
  let possibleSaving = 0;
  for (const row of rows) {
    const kind = classify(row, supplier.id);
    if (kind === "notSent") {
      notSentCount += 1;
      continue;
    }
    counts[kind] += 1;
    counts.all += 1;
    const cell = row.cells.get(supplier.id);
    const sameUnit = !row.usesNormalizedComparison && row.purchaseUnit === row.pricingUnit;
    if ((kind === "best" || kind === "above") && cell?.currentPrice != null && sameUnit) {
      comparableItems += 1;
      offerTotal += cell.currentPrice * row.requestedQuantity;
      possibleSaving += gap(row, cell)?.total ?? 0;
    }
  }

  const sentRows = rows.filter((row) => classify(row, supplier.id) !== "notSent");
  const visibleRows = sentRows.filter((row) => {
    if (!matchesSearch(row)) return false;
    return filter === "all" || classify(row, supplier.id) === filter;
  });
  const notSentRows = filter === "all" ? rows.filter((row) => classify(row, supplier.id) === "notSent" && matchesSearch(row)) : [];

  const move = (direction: -1 | 1) => {
    const next = (currentIndex + direction + suppliers.length) % suppliers.length;
    setSupplierId(suppliers[next].id);
    setSupplierPanelOpen(false);
  };

  const selectSupplier = (nextSupplierId: string) => {
    setSupplierId(nextSupplierId);
    setSupplierPanelOpen(false);
  };

  const completed = Boolean(supplier.completed_at);
  const filterOrder: Filter[] = ["all", "above", "missing", "unavailable", "best"];

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        Fornecedor em análise: {supplier.suppliers.name}, {currentIndex + 1} de {suppliers.length}.
      </p>

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
            <span className="text-fg-muted block text-[13px]">
              Fornecedor em análise · {currentIndex + 1} de {suppliers.length}
            </span>
            <strong className="text-fg block truncate text-sm">
              {supplier.suppliers.name} · {stats.priced}/{rows.length} preços
            </strong>
          </span>
          {stats.missing > 0 ? (
            <Badge variant="destructive" className="shrink-0">
              {stats.missing} {stats.missing === 1 ? "pendente" : "pendentes"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              completo
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "text-fg-muted size-4 shrink-0 transition-transform",
              supplierPanelOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        <div
          id="comparison-supplier-panel"
          className={cn(supplierPanelOpen ? "block" : "hidden md:block")}
        >
          <div className="flex flex-wrap items-end gap-3 p-3">
            <span className="bg-primary/10 hidden self-center rounded-lg p-2 md:inline-flex"><Store className="text-primary size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1 md:min-w-52">
              <label htmlFor="comparison-supplier" className="text-fg-muted mb-1 block text-[13px] font-medium">Fornecedor em análise · {currentIndex + 1} de {suppliers.length}</label>
              <ThemedSelect
                id="comparison-supplier"
                value={supplier.id}
                onValueChange={selectSupplier}
                className="h-11 max-w-md font-semibold sm:h-9"
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
              <Button type="button" variant="outline" className="size-11 sm:size-9" aria-label="Fornecedor anterior" onClick={() => move(-1)}><ChevronLeft className="size-4" aria-hidden /></Button>
              <Button type="button" variant="outline" className="size-11 sm:size-9" aria-label="Próximo fornecedor" onClick={() => move(1)}><ChevronRight className="size-4" aria-hidden /></Button>
            </div>
            {/* Não é contador nem filtro: é só o estado da resposta, sem competir com as ações. */}
            <p className="text-fg-muted flex items-center gap-1.5 self-center text-sm">
              {completed ? (
                <>
                  <CircleCheck className="text-success size-4" aria-hidden /> Resposta concluída
                </>
              ) : (
                "Ainda não concluiu a resposta"
              )}
            </p>
            {dados.podeNegociar && supplier.removed_at === null ? (
              <div className="ml-auto">
                <NegotiationReferenceDialog
                  key={supplier.id}
                  roundId={dados.round.id}
                  roundSupplierId={supplier.id}
                  supplierName={supplier.suppliers.name}
                  candidates={negotiationCandidates}
                  requests={dados.negotiationReferences.filter(
                    (request) => request.roundSupplierId === supplier.id,
                  )}
                />
              </div>
            ) : null}
          </div>

          <div className="border-primary/20 bg-primary/[0.035] flex flex-col gap-1 border-t px-3 py-2">
            <p className="text-fg-muted text-[13px]">
              Todas as ações abaixo alteram a resposta de <strong className="text-fg">{supplier.suppliers.name}</strong>.
              A referência é o menor preço comparável da rodada.
            </p>
            {comparableItems > 0 ? (
              <p className="text-fg text-sm tabular-nums">
                Cotado com {supplier.suppliers.name}: <strong>R$ {MONEY.format(offerTotal)}</strong> em {comparableItems}{" "}
                {comparableItems === 1 ? "item" : "itens"}
                {possibleSaving > 0 ? (
                  <>
                    {" · "}igualando a melhor referência:{" "}
                    <strong className="text-success">R$ {MONEY.format(offerTotal - possibleSaving)}</strong>{" "}
                    <span className="text-fg-muted">(economia de R$ {MONEY.format(possibleSaving)})</span>
                  </>
                ) : (
                  <span className="text-fg-muted"> · já está na melhor referência em todos</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="text-fg-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produto ou grupo"
            aria-label="Buscar produto ou grupo"
            className="h-11 pl-9 sm:h-9"
          />
        </div>
        <div role="group" aria-label="Filtrar itens de acordo com a resposta" className="flex flex-wrap gap-2">
          {filterOrder
            .filter((value) => value === "all" || counts[value] > 0 || filter === value)
            .map((value) => (
              <Button
                key={value}
                type="button"
                variant={filter === value ? "default" : "outline"}
                aria-pressed={filter === value}
                className="h-11 gap-1.5 px-3 text-[13px] sm:h-9"
                onClick={() => setFilter(value)}
              >
                {FILTER_LABEL[value]}
                <span className="tabular-nums opacity-80">{counts[value]}</span>
              </Button>
            ))}
        </div>
      </div>

      <div key={supplier.id} className="@container space-y-4">
        {visibleRows.length > 0 ? (
          <div
            role="table"
            aria-label={`Respostas de ${supplier.suppliers.name} contra a melhor referência`}
            className="border-border bg-surface overflow-hidden rounded-xl border"
          >
            <div role="rowgroup">
              <div role="row" className={cn("border-border bg-surface-sunken text-fg-muted hidden gap-x-4 border-b px-3 py-2 text-[13px] font-medium @2xl:grid", COLUMNS)}>
                <div role="columnheader">Produto</div>
                <div role="columnheader">Proposta de {supplier.suppliers.name}</div>
                <div role="columnheader">Melhor referência</div>
              </div>
            </div>
            <div role="rowgroup" className="divide-border divide-y">
              {visibleRows.map((row) => (
                <ComparisonRow key={row.itemId} row={row} supplier={supplier} dados={dados} />
              ))}
            </div>
          </div>
        ) : (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">
            {notSentRows.length > 0
              ? `Nenhum item com resposta de ${supplier.suppliers.name} corresponde à busca.`
              : "Nenhum produto corresponde a este filtro."}
          </p>
        )}

        {notSentRows.length > 0 ? (
          <section aria-labelledby="comparison-not-sent">
            <h2 id="comparison-not-sent" className="text-fg-muted mb-1.5 px-1 text-sm font-medium">
              Não enviados a {supplier.suppliers.name} ({notSentCount})
            </h2>
            <ul className="border-border bg-surface-sunken divide-border divide-y rounded-xl border">
              {notSentRows.map((row) => (
                <li key={row.itemId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="text-fg font-medium">{row.productName}</span>
                  <span className="text-fg-muted tabular-nums">
                    {row.bestComparablePrice !== null
                      ? `melhor R$ ${priceText(row, row.bestComparablePrice)} / ${unitText(row)}`
                      : "sem preço na rodada"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {rows.some((row) => row.conversionName) ? (
        <p className="text-fg-muted px-1 text-[13px]">
          Quando todos informam a apresentação, a referência e os destaques usam o custo normalizado por unidade. Se algum fator estiver ausente, a tela sinaliza os valores sem misturar unidades diferentes. Uma negociação preserva o preço original no histórico.
        </p>
      ) : (
        <p className="text-fg-muted px-1 text-[13px]">Uma negociação preserva o preço original no histórico.</p>
      )}
    </div>
  );
}

function ComparisonRow({ row, supplier, dados }: { row: Row; supplier: Supplier; dados: DadosDaComparacao }) {
  const [mostrandoTodos, setMostrandoTodos] = React.useState(false);
  const cell = row.cells.get(supplier.id);
  const kind = classify(row, supplier.id);
  const isBest = kind === "best";
  const bestSuppliers = dados.suppliers.filter((candidate) => {
    const candidateCell = row.cells.get(candidate.id);
    return (
      row.bestComparablePrice !== null &&
      comparablePrice(row, candidateCell) === row.bestComparablePrice &&
      !candidateCell?.doesNotSupply &&
      candidateCell?.isAvailable !== false
    );
  });
  const others = bestSuppliers.filter((candidate) => candidate.id !== supplier.id);
  const difference = gap(row, cell);
  const answered = dados.suppliers.filter((candidate) => row.cells.has(candidate.id)).length;
  const temOutros = dados.suppliers.length > 1 && answered > 1;
  const idDoPainel = `respostas-${row.itemId}`;

  return (
    <div role="row" className={cn("grid gap-x-4 gap-y-3 px-3 py-3 @2xl:items-start", COLUMNS)}>
      <div role="cell">
        <p className="text-fg text-[15px] leading-snug font-semibold">{row.productName}</p>
        <p className="text-fg-muted mt-0.5 text-[13px]">{row.groupName} · {QTY.format(row.requestedQuantity)} {row.purchaseUnit} · preço por {row.pricingUnit}</p>
        {row.conversionName ? <Badge variant={row.requiresPresentationComparison && !row.usesNormalizedComparison ? "destructive" : "outline"} className="mt-2">{row.requiresPresentationComparison && !row.usesNormalizedComparison ? "falta apresentação" : "comparação por apresentação"}</Badge> : null}
      </div>

      <div role="cell" className="border-border @2xl:border-l @2xl:pl-4">
        <p className="text-fg-muted mb-1 text-[13px] font-medium @2xl:hidden">Proposta de {supplier.suppliers.name}</p>
        <SupplierOffer row={row} supplier={supplier} cell={cell} dados={dados} emphasizeNegotiation={kind === "above"} />
      </div>

      <div role="cell" className="border-border @2xl:border-l @2xl:pl-4">
        <p className="text-fg-muted mb-1 text-[13px] font-medium @2xl:hidden">Melhor referência</p>
        {row.bestComparablePrice === null ? (
          <span className="text-fg-muted text-sm">{row.requiresPresentationComparison ? "Preencha a apresentação de todas as propostas" : "Nenhum preço recebido"}</span>
        ) : isBest ? (
          // Quem está em análise é o menor preço: repetir o valor aqui só duplicaria a coluna ao lado.
          <div>
            <p className="text-fg flex items-center gap-1.5 text-sm font-medium"><Check className="text-success size-4" aria-hidden /> Menor preço da rodada</p>
            {others.length > 0 ? <p className="text-fg-muted mt-0.5 text-[13px]">Empata com {others.map((best) => best.suppliers.name).join(", ")}</p> : null}
          </div>
        ) : (
          <div>
            <p className="text-fg tabular-nums">
              <span className="font-semibold">R$ {priceText(row, row.bestComparablePrice)}</span>
              <span className="text-fg-muted text-[13px]"> / {unitText(row)}</span>
            </p>
            <p className="text-fg-muted text-[13px]">{bestSuppliers.map((best) => best.suppliers.name).join(", ")}</p>
            {difference ? (
              <p className="text-destructive mt-1.5 text-sm font-medium tabular-nums">
                +R$ {priceText(row, difference.unit)}/{unitText(row)}
                {difference.percent !== null ? ` (+${PERCENT.format(difference.percent)}%)` : ""}
                {difference.total !== null ? (
                  <span className="text-fg-muted block font-normal">
                    ≈ R$ {MONEY.format(difference.total)} em {QTY.format(row.requestedQuantity)} {row.purchaseUnit}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        )}
        {/* A decisão real é "e os outros, quanto deram?": o caminho é texto, não um ícone. */}
        {temOutros ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMostrandoTodos((atual) => !atual)}
            aria-expanded={mostrandoTodos}
            aria-controls={idDoPainel}
            className="text-fg-muted hover:text-fg -ml-2 mt-1 h-11 gap-1 px-2 text-[13px] sm:h-9"
          >
            {mostrandoTodos ? "Ocultar as respostas" : `Ver as ${answered} respostas`}
            <ChevronDown className={cn("size-4 transition-transform", mostrandoTodos && "rotate-180")} aria-hidden />
            <span className="sr-only"> de {row.productName}</span>
          </Button>
        ) : null}
        {temOutros && mostrandoTodos ? <TodasAsRespostas id={idDoPainel} row={row} dados={dados} emAnalise={supplier.id} /> : null}
      </div>
    </div>
  );
}

/**
 * O que cada fornecedor respondeu neste produto, sem sair do que está em análise.
 *
 * A comparação mostra um fornecedor por vez justamente para não virar matriz
 * larga com rolagem horizontal. Mas na hora de decidir surge sempre a mesma
 * pergunta — "e os outros, quanto deram?" — e respondê-la exigia trocar o
 * fornecedor em análise e perder o lugar. Aqui a lista abre no próprio item.
 *
 * Ordem: quem deu preço primeiro, do menor para o maior, porque é assim que a
 * decisão é tomada. Quem não deu vem depois, com o motivo — e isso também
 * responde por que uma referência pode estar vazia.
 */
function TodasAsRespostas({ id, row, dados, emAnalise }: { id: string; row: Row; dados: DadosDaComparacao; emAnalise: string }) {
  const linhas = dados.suppliers
    .flatMap((candidato) => {
      const cell = row.cells.get(candidato.id);
      // Sem célula o item nunca foi enviado a este fornecedor: citá-lo aqui
      // sugeriria uma omissão que não houve.
      if (!cell) return [];
      const preco = cell.doesNotSupply || cell.isAvailable === false ? null : comparablePrice(row, cell);
      return [{ id: candidato.id, nome: candidato.suppliers.name, cell, preco }];
    })
    .sort((a, b) => {
      if (a.preco !== null && b.preco !== null) return a.preco - b.preco;
      if (a.preco !== null) return -1;
      if (b.preco !== null) return 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  return (
    <ul id={id} className="border-border bg-surface-sunken mt-2 flex flex-col gap-2 rounded-lg border p-3">
      {linhas.map((linha) => {
        const melhor = linha.preco !== null && linha.preco === row.bestComparablePrice;
        return (
          <li key={linha.id} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[13px]">
            <span className={cn("min-w-0", linha.id === emAnalise ? "text-fg font-medium" : "text-fg-muted")}>
              {linha.nome}
              {linha.id === emAnalise ? <span className="text-fg-muted font-normal"> · em análise</span> : null}
            </span>
            {linha.preco !== null ? (
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span className={cn("tabular-nums", melhor ? "text-success font-semibold" : "text-fg")}>
                  R$ {priceText(row, linha.preco)}{row.usesNormalizedComparison ? `/${row.comparisonUnit}` : ""}
                </span>
                {melhor ? <span className="text-success font-medium">melhor</span> : null}
                {row.usesNormalizedComparison && linha.cell.currentPrice !== null ? <span className="text-fg-muted tabular-nums">pacote R$ {MONEY.format(linha.cell.currentPrice)}</span> : linha.cell.normalizedPrice !== null && row.comparisonUnit ? <span className="text-fg-muted tabular-nums">= {formatUnitPrice(linha.cell.normalizedPrice)}/{row.comparisonUnit}</span> : null}
              </span>
            ) : (
              <span className="text-fg-muted">
                {linha.cell.doesNotSupply ? "não fornece" : linha.cell.isAvailable === false ? "sem disponibilidade" : linha.cell.responseItemId === null ? "aguardando preço" : "resposta sem preço"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SupplierOffer({
  row,
  supplier,
  cell,
  dados,
  emphasizeNegotiation,
}: {
  row: Row;
  supplier: Supplier;
  cell: Cell | undefined;
  dados: DadosDaComparacao;
  emphasizeNegotiation: boolean;
}) {
  if (!cell) return <p className="text-fg-muted text-sm">Não enviado a {supplier.suppliers.name}.</p>;

  const correction = (props: { currentPrice: number | null; doesNotSupply: boolean; isAvailable?: boolean | null }) =>
    dados.podeCorrigir && cell.responseItemId ? (
      <CorrectionForm
        responseItemId={cell.responseItemId}
        roundId={dados.round.id}
        currentPrice={props.currentPrice}
        doesNotSupply={props.doesNotSupply}
        isAvailable={props.isAvailable}
        supplierName={supplier.suppliers.name}
        productName={row.productName}
        pricingUnit={row.pricingUnit}
        conversionDefinitionId={row.conversionDefinitionId}
        conversionName={row.conversionName}
        conversionUnit={row.conversionUnit}
        currentConversionFactor={cell.conversionFactor}
        conversionRequired={row.conversionRequired}
        pricingUnitInfo={row.pricingUnitInfo}
        comparisonUnitInfo={row.comparisonUnitInfo}
      />
    ) : null;

  if (cell.doesNotSupply) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline">não fornece</Badge>{cell.correctionCount > 0 ? <Badge variant="outline">corrigido</Badge> : null}</div>
        {cell.notes ? <p className="text-fg-muted mt-1 text-[13px]">{cell.notes}</p> : null}
        {correction({ currentPrice: cell.currentPrice, doesNotSupply: true })}
      </div>
    );
  }

  if (cell.isAvailable === false) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline">sem disponibilidade nesta cotação</Badge>{cell.correctionCount > 0 ? <Badge variant="outline">corrigido</Badge> : null}</div>
        {cell.notes ? <p className="text-fg-muted mt-1 text-[13px]">{cell.notes}</p> : null}
        {correction({ currentPrice: null, doesNotSupply: false, isAvailable: false })}
      </div>
    );
  }

  if (cell.responseItemId === null) {
    const link = row.supplierQuotationItemBySupplier.get(supplier.id);
    return <div><Badge variant="destructive">aguardando preço</Badge>{dados.podeLancar && link ? <ManualPriceForm supplierQuotationItemId={link} roundId={dados.round.id} supplierName={supplier.suppliers.name} productName={row.productName} pricingUnit={row.pricingUnit} comparisonUnit={row.comparisonUnit} conversionDefinitionId={row.conversionDefinitionId} conversionName={row.conversionName} conversionUnit={row.conversionUnit} conversionRequired={row.conversionRequired} pricingUnitInfo={row.pricingUnitInfo} comparisonUnitInfo={row.comparisonUnitInfo} /> : null}</div>;
  }

  if (cell.currentPrice === null) return <Badge variant="destructive">resposta sem preço</Badge>;

  const own = comparablePrice(row, cell);
  const best = own !== null && own === row.bestComparablePrice;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("text-base font-semibold tabular-nums", best ? "text-success" : "text-fg")}>R$ {MONEY.format(cell.currentPrice)}</span>
        {best ? <Badge variant="secondary">melhor</Badge> : null}
        {cell.correctionCount > 0 ? <Badge variant="outline">corrigido</Badge> : null}
      </div>
      {cell.negotiated && cell.quotedPrice !== null ? <p className="text-fg-muted text-[13px] line-through tabular-nums">Original: R$ {MONEY.format(cell.quotedPrice)}</p> : null}
      {cell.normalizedPrice !== null ? <p className={cn("text-[13px] tabular-nums", row.bestNormalized !== null && cell.normalizedPrice === row.bestNormalized ? "text-success font-medium" : "text-fg-muted")}>= {formatUnitPrice(cell.normalizedPrice)} / {row.comparisonUnit}</p> : null}
      {cell.attributes.length > 0 ? <p className="text-fg-muted mt-1 text-[13px]">{cell.attributes.map((attribute) => `${attribute.name}: ${attribute.value}`).join(" · ")}</p> : null}
      {cell.notes ? <p className="text-fg-muted mt-1 text-[13px]">{cell.notes}</p> : null}
      <div className="mt-1 flex flex-wrap items-start gap-1">
        {dados.podeNegociar ? <NegotiationForm responseItemId={cell.responseItemId} roundId={dados.round.id} currentPrice={cell.currentPrice} supplierName={supplier.suppliers.name} productName={row.productName} emphasis={emphasizeNegotiation} /> : null}
        {correction({ currentPrice: cell.currentPrice, doesNotSupply: false })}
      </div>
    </div>
  );
}
