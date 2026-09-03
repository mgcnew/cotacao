import { CheckCircle2, CircleSlash2, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  RoundRealizationDetails,
  RoundRealizationSummary,
} from "@/components/rounds/round-realization-report";
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
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function RoundReportContent({ report }: { report: RoundReport }) {
  const coverage = `${report.summary.calculablePurchasedItems}/${report.summary.purchasedItemCount}`;

  return (
    <article className="space-y-6" data-slot="quotation-report">
      {report.round.status !== "completed" ? (
        <div className="border-warning/35 bg-warning/5 text-fg rounded-xl border px-4 py-3 text-sm">
          Esta é uma prévia. A cotação ainda está em andamento e os números
          podem mudar até a conclusão.
        </div>
      ) : null}

      <section className="border-border bg-surface-sunken grid gap-3 rounded-xl border p-3 text-xs sm:grid-cols-3">
        <div>
          <p className="text-fg-subtle">Início</p>
          <p className="text-fg mt-0.5 font-medium">
            {report.round.startedAt
              ? DATE_TIME.format(new Date(report.round.startedAt))
              : "Não registrado"}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle">Conclusão</p>
          <p className="text-fg mt-0.5 font-medium">
            {report.round.completedAt
              ? DATE_TIME.format(new Date(report.round.completedAt))
              : "Em andamento"}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle">Situação</p>
          <p className="text-fg mt-0.5 font-medium">
            {report.round.status === "completed" ? "Concluída" : "Em andamento"}
          </p>
        </div>
        {report.round.notes ? (
          <div className="border-border border-t pt-3 sm:col-span-3">
            <p className="text-fg-subtle">Observações</p>
            <p className="text-fg mt-0.5">{report.round.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <ReportMetric
          label="Itens cotados"
          value={String(report.summary.itemCount)}
          detail={`${report.summary.purchasedItemCount} com compra`}
        />
        <ReportMetric
          label="Fornecedores vencedores"
          value={String(report.summary.winnerCount)}
          detail={`${report.summary.supplierCount} participantes`}
        />
        <ReportMetric
          label="Valor adjudicado estimado"
          value={MONEY.format(report.summary.estimatedAwardedValue)}
          detail={`${coverage} itens comprados calculáveis`}
          warning={
            report.summary.calculablePurchasedItems <
            report.summary.purchasedItemCount
          }
        />
        <ReportMetric
          label="Economia negociada"
          value={MONEY.format(report.summary.negotiatedSavings)}
          detail="preço original x preço adjudicado"
        />
        <ReportMetric
          label="Escolha de embalagens"
          value={MONEY.format(report.summary.packagingChoiceResult)}
          detail="custo unitário x melhor alternativa"
          warning={report.summary.packagingChoiceResult < 0}
        />
      </section>

      {report.summary.calculablePurchasedItems <
      report.summary.purchasedItemCount ? (
        <p className="border-warning/35 bg-warning/5 rounded-xl border px-4 py-3 text-sm">
          O valor e a economia abrangem {coverage} itens comprados. Produtos
          sem conversão confiável entre unidade de compra e de preço foram
          excluídos dos totais, e não tratados como economia zero.
        </p>
      ) : null}

      <RoundRealizationSummary realization={report.realization} />

      <section>
        <h2 className="text-fg mb-1 text-base font-semibold">
          Resultado por fornecedor
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Participação, itens ganhos e valor estimado adjudicado.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {report.suppliers.map((supplier) => (
            <article key={supplier.id} className="border-border rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <span className="bg-surface-muted rounded-lg p-2">
                  <Store className="text-fg-muted size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-fg font-semibold wrap-anywhere">
                    {supplier.name}
                  </h3>
                  <p className="text-fg mt-1 font-semibold tabular-nums">
                    {MONEY.format(supplier.awardedValue)}
                  </p>
                  <p className="text-fg-subtle text-xs">valor estimado</p>
                </div>
                <Badge variant={supplier.wins > 0 ? "secondary" : "outline"}>
                  {supplier.wins} ganhos
                </Badge>
              </div>
              <div className="text-fg-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span>{supplier.losses} perdidos</span>
                <span>{supplier.noResponses} sem resposta</span>
                {supplier.unavailable > 0 ? (
                  <span>{supplier.unavailable} não fornece</span>
                ) : null}
              </div>
              {supplier.uncalculatedWins > 0 ? (
                <p className="text-warning mt-2 text-xs">
                  {supplier.uncalculatedWins} ganhos fora do valor por falta de
                  conversão.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <RoundRealizationDetails realization={report.realization} />

      <section>
        <h2 className="text-fg mb-1 text-base font-semibold">
          Produtos cotados
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Propostas finais separadas pelos grupos enviados aos fornecedores.
        </p>
        <div className="space-y-4">
          {report.groups.map((group) => (
            <section key={group.name} className="border-border overflow-hidden rounded-xl border">
              <header className="bg-surface-sunken border-border flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-fg text-sm font-semibold">{group.name}</h3>
                <Badge variant="outline">{group.items.length} itens</Badge>
              </header>
              <div className="divide-border divide-y">
                {group.items.map((item) => (
                  <ReportItem key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <footer className="border-border text-fg-subtle border-t pt-3 text-xs">
        Posição da conclusão gerada em{" "}
        {DATE_TIME.format(new Date(report.generatedAt))}. Economia negociada
        considera somente propostas vencedoras com quantidade convertida para
        a unidade de preço.
        {report.realization ? (
          <>
            {" "}Posição dos recebimentos consultada em{" "}
            {DATE_TIME.format(new Date(report.realization.calculatedAt))}.
          </>
        ) : null}
      </footer>
    </article>
  );
}

function ReportMetric({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className="border-border min-w-0 rounded-xl border p-3">
      <p className="text-fg-muted text-xs">{label}</p>
      <p
        className={
          warning
            ? "text-warning mt-1 wrap-anywhere text-lg font-semibold tabular-nums"
            : "text-fg mt-1 wrap-anywhere text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </p>
      <p className="text-fg-subtle text-xs">{detail}</p>
    </div>
  );
}

function ReportItem({ item }: { item: RoundReportItem }) {
  const winners = item.offers.filter((offer) => offer.outcome === "won");
  return (
    <article className="px-4 py-3 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-fg text-sm font-semibold">{item.productName}</h4>
          <p className="text-fg-subtle text-xs">
            {QTY.format(item.requestedQuantity)} {item.purchaseUnit} · preço por {item.pricingUnit}
          </p>
        </div>
        <Badge variant={winners.length > 0 ? "secondary" : "outline"}>
          {winners.length > 0 ? "compra decidida" : "sem compra"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {item.offers.map((offer) => (
          <ReportOffer key={offer.supplierId} offer={offer} item={item} />
        ))}
      </div>
    </article>
  );
}

function ReportOffer({
  offer,
  item,
}: {
  offer: RoundReportOffer;
  item: RoundReportItem;
}) {
  return (
    <div
      className={
        offer.outcome === "won"
          ? "border-success/35 bg-success-soft rounded-lg border p-2.5"
          : "border-border bg-surface-sunken rounded-lg border p-2.5"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-fg min-w-0 text-xs font-semibold wrap-anywhere">
          {offer.supplierName}
        </p>
        {offer.outcome === "won" ? (
          <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Vencedor" />
        ) : offer.outcome === "unavailable" ? (
          <CircleSlash2 className="text-fg-subtle size-4 shrink-0" aria-label="Não fornece" />
        ) : null}
      </div>
      {offer.outcome === "won" ? (
        <>
          <p className="text-success mt-1 text-sm font-semibold tabular-nums">
            {MONEY.format(offer.selectedPrice ?? 0)} / {item.pricingUnit}
          </p>
          <p className="text-fg-muted text-xs">
            {QTY.format(offer.wonQuantity)} {item.purchaseUnit} adjudicados
          </p>
          {offer.estimatedPricingQuantity !== null ? (
            <p className="text-fg-subtle text-xs">
              estimativa: {QTY.format(offer.estimatedPricingQuantity)} {item.pricingUnit}
            </p>
          ) : (
            <p className="text-warning text-xs">sem conversão para o total</p>
          )}
          {offer.quotedPrice !== null &&
          offer.quotedPrice !== offer.selectedPrice ? (
            <p className="text-fg-subtle text-xs line-through tabular-nums">
              Original: {MONEY.format(offer.quotedPrice)}
            </p>
          ) : null}
        </>
      ) : offer.outcome === "lost" ? (
        <>
          <p className="text-fg mt-1 text-sm font-semibold tabular-nums">
            {MONEY.format(offer.finalPrice ?? 0)} / {item.pricingUnit}
          </p>
          <p className="text-fg-subtle text-xs">não selecionado</p>
        </>
      ) : offer.outcome === "unavailable" ? (
        <p className="text-fg-subtle mt-1 text-xs">Não fornece</p>
      ) : (
        <p className="text-fg-subtle mt-1 text-xs">Não respondeu</p>
      )}
    </div>
  );
}
