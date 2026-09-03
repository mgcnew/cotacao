import { Check, ChevronDown, CircleSlash2, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RoundRealizationSummary } from "@/components/rounds/round-realization-report";
import type {
  RoundReport,
  RoundReportItem,
  RoundReportOffer,
} from "@/features/rounds/report";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function RoundReportSimpleContent({ report }: { report: RoundReport }) {
  const coverage = `${report.summary.calculablePurchasedItems} de ${report.summary.purchasedItemCount}`;
  const hasSavings = report.summary.negotiatedSavings >= 0;

  return (
    <article
      className="space-y-5"
      data-slot="quotation-report"
      data-report-variant="simple"
    >
      {report.round.status !== "completed" ? (
        <div className="border-warning/35 bg-warning/5 text-fg rounded-xl border px-4 py-3 text-sm">
          Esta é uma prévia. Os resultados podem mudar até a cotação ser
          concluída.
        </div>
      ) : null}

      <section
        className={
          hasSavings
            ? "border-success/30 bg-success-soft overflow-hidden rounded-2xl border px-4 py-5 text-center sm:px-6"
            : "border-danger/30 bg-danger/10 overflow-hidden rounded-2xl border px-4 py-5 text-center sm:px-6"
        }
      >
        <p
          className={
            hasSavings
              ? "text-success text-xs font-bold tracking-wide uppercase"
              : "text-danger text-xs font-bold tracking-wide uppercase"
          }
        >
          {hasSavings ? "Economia na negociação" : "Acréscimo na negociação"}
        </p>
        <p
          className={
            hasSavings
              ? "text-success mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
              : "text-danger mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
          }
        >
          {MONEY.format(Math.abs(report.summary.negotiatedSavings))}
        </p>
        <p className="text-fg-muted mx-auto mt-2 max-w-lg text-sm">
          Diferença entre o primeiro preço e o preço fechado com os fornecedores
          vencedores.
        </p>
      </section>

      {report.summary.packagingChoiceResult !== 0 ? (
        <section className="border-primary/25 bg-primary-soft rounded-xl border px-4 py-3 text-center">
          <p className="text-fg-muted text-xs font-semibold tracking-wide uppercase">
            Resultado da escolha de embalagens
          </p>
          <p className={report.summary.packagingChoiceResult > 0 ? "text-success mt-1 text-2xl font-bold tabular-nums" : "text-danger mt-1 text-2xl font-bold tabular-nums"}>
            {MONEY.format(report.summary.packagingChoiceResult)}
          </p>
          <p className="text-fg-subtle mt-1 text-xs">
            Comparação por unidade contra a melhor apresentação alternativa.
          </p>
        </section>
      ) : null}

      <RoundRealizationSummary realization={report.realization} compact />

      <section className="grid grid-cols-3 gap-2">
        <SimpleMetric
          label="Valor da compra"
          value={MONEY.format(report.summary.estimatedAwardedValue)}
        />
        <SimpleMetric
          label="Produtos comprados"
          value={`${report.summary.purchasedItemCount} de ${report.summary.itemCount}`}
        />
        <SimpleMetric
          label="Participantes"
          value={String(report.summary.supplierCount)}
        />
      </section>

      {report.summary.calculablePurchasedItems <
      report.summary.purchasedItemCount ? (
        <p className="border-warning/35 bg-warning/5 rounded-xl border px-4 py-3 text-sm">
          O valor total e a economia incluem {coverage} produtos comprados. Os
          demais não possuem conversão suficiente para calcular o total com
          segurança.
        </p>
      ) : null}

      <section>
        <div className="mb-3">
          <h2 className="text-fg text-lg font-semibold">Produtos cotados</h2>
          <p className="text-fg-muted text-sm">
            Resultado direto de cada produto e quem participou.
          </p>
        </div>

        <div className="space-y-4">
          {report.groups.map((group) => (
            <section
              key={group.name}
              className="border-border overflow-hidden rounded-xl border"
            >
              <header className="border-border bg-surface-sunken flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-fg text-sm font-bold">{group.name}</h3>
                <Badge variant="outline">{group.items.length} produtos</Badge>
              </header>
              <div className="divide-border divide-y">
                {group.items.map((item) => (
                  <SimpleProduct key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <footer className="border-border text-fg-subtle border-t pt-3 text-xs">
        {report.round.completedAt
          ? `Cotação concluída em ${DATE.format(new Date(report.round.completedAt))}. `
          : "Cotação ainda em andamento. "}
        {report.realization
          ? `Recebimentos consultados em ${DATE.format(new Date(report.realization.calculatedAt))}. `
          : ""}
        Para consultar os preços e cálculos por produto, abra o relatório
        completo.
      </footer>
    </article>
  );
}

function SimpleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border min-w-0 rounded-xl border p-2.5 text-center sm:p-3">
      <p className="text-fg-subtle text-[10px] leading-tight sm:text-xs">
        {label}
      </p>
      <p className="text-fg mt-1 wrap-anywhere text-sm font-bold tabular-nums sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function SimpleProduct({ item }: { item: RoundReportItem }) {
  const winners = item.offers.filter((offer) => offer.outcome === "won");
  const otherQuotes = item.offers.filter((offer) => offer.outcome === "lost");
  const noResponses = item.offers.filter(
    (offer) => offer.outcome === "no_response",
  );
  const unavailable = item.offers.filter(
    (offer) => offer.outcome === "unavailable",
  );
  const otherParticipants = [...otherQuotes, ...noResponses, ...unavailable];

  return (
    <article className="break-inside-avoid px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-fg text-base font-bold">{item.productName}</h4>
          <p className="text-fg-muted text-sm">
            Pedido: {QTY.format(item.requestedQuantity)} {item.purchaseUnit}
          </p>
        </div>
        <span className="text-fg-subtle flex items-center gap-1 text-xs">
          <UsersRound className="size-3.5" aria-hidden />
          {item.offers.length} participantes
        </span>
      </div>

      {winners.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {winners.map((winner) => (
            <Winner key={winner.supplierId} offer={winner} item={item} />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface-sunken mt-3 flex items-center gap-2 rounded-xl border px-3 py-3">
          <CircleSlash2 className="text-fg-subtle size-5" aria-hidden />
          <strong className="text-fg text-sm">Produto não comprado</strong>
        </div>
      )}

      {otherParticipants.length ? (
        <details
          data-slot="simple-report-participants"
          className="group border-border bg-surface-sunken mt-3 overflow-hidden rounded-xl border"
        >
          <summary className="text-fg hover:bg-surface-muted flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden">
            <span>
              Outros participantes e preços ({otherParticipants.length})
            </span>
            <ChevronDown
              className="text-fg-subtle size-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="participant-list border-border grid gap-2 border-t p-2 sm:grid-cols-2">
            {otherParticipants.map((offer) => (
              <ParticipantOffer
                key={offer.supplierId}
                offer={offer}
                item={item}
              />
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function Winner({
  offer,
  item,
}: {
  offer: RoundReportOffer;
  item: RoundReportItem;
}) {
  const negotiated =
    offer.quotedPrice !== null &&
    offer.selectedPrice !== null &&
    offer.quotedPrice !== offer.selectedPrice;

  return (
    <div className="border-success/35 bg-success-soft rounded-xl border px-3 py-3">
      <p className="text-success flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
        <span className="bg-success grid size-5 place-items-center rounded-full text-white">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
        Comprado de
      </p>
      <p className="text-fg mt-2 text-base font-bold wrap-anywhere">
        {offer.supplierName}
      </p>
      {negotiated ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Price label="Preço inicial" value={offer.quotedPrice} item={item} />
          <Price
            label="Preço negociado"
            value={offer.selectedPrice}
            item={item}
            highlight
          />
        </div>
      ) : (
        <Price
          label="Preço fechado"
          value={offer.selectedPrice}
          item={item}
          highlight
          className="mt-2"
        />
      )}
      <p className="text-fg-muted text-sm">
        {QTY.format(offer.wonQuantity)} {item.purchaseUnit}
      </p>
    </div>
  );
}

function ParticipantOffer({
  offer,
  item,
}: {
  offer: RoundReportOffer;
  item: RoundReportItem;
}) {
  const negotiated =
    offer.quotedPrice !== null &&
    offer.finalPrice !== null &&
    offer.quotedPrice !== offer.finalPrice;

  return (
    <div className="border-border bg-surface rounded-lg border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-fg text-sm font-semibold wrap-anywhere">
          {offer.supplierName}
        </p>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {offer.outcome === "lost"
            ? "Cotou"
            : offer.outcome === "unavailable"
              ? "Não fornece"
              : "Não respondeu"}
        </Badge>
      </div>
      {offer.outcome === "lost" ? (
        negotiated ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Price label="Inicial" value={offer.quotedPrice} item={item} />
            <Price label="Negociado" value={offer.finalPrice} item={item} />
          </div>
        ) : (
          <Price
            label="Preço informado"
            value={offer.finalPrice}
            item={item}
            className="mt-2"
          />
        )
      ) : (
        <p className="text-fg-subtle mt-2 text-xs">
          {offer.outcome === "unavailable"
            ? "Informou que não trabalha com este produto."
            : "Nenhum preço foi informado."}
        </p>
      )}
    </div>
  );
}

function Price({
  label,
  value,
  item,
  highlight = false,
  className = "",
}: {
  label: string;
  value: number | null;
  item: RoundReportItem;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-fg-subtle text-[10px]">{label}</p>
      <p
        className={
          highlight
            ? "text-success text-sm font-bold tabular-nums"
            : "text-fg text-sm font-semibold tabular-nums"
        }
      >
        {value === null
          ? "Não informado"
          : `${MONEY.format(value)} / ${item.pricingUnit}`}
      </p>
    </div>
  );
}
