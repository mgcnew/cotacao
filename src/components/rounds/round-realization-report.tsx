import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RoundReportRealization } from "@/features/rounds/report";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function resultClass(value: number, inverse = false) {
  if (value === 0) return "text-fg";
  const favorable = inverse ? value < 0 : value > 0;
  return favorable ? "text-success" : "text-destructive";
}

function receiptStatusLabel(status: "pending" | "partial" | "received") {
  if (status === "received") return "Recebido";
  if (status === "partial") return "Parcial";
  return "Pendente";
}

function ReceiptPosition({
  realization,
}: {
  realization: RoundReportRealization;
}) {
  const summary = realization.summary;
  const finished =
    summary.orderedItemCount > 0 && summary.pendingItemCount === 0 &&
    summary.partiallyReceivedItemCount === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={finished ? "default" : "secondary"}>
        {finished
          ? "Conferência concluída"
          : summary.receivedItemCount > 0
            ? "Resultado parcial"
            : "Aguardando conferência"}
      </Badge>
      <span className="text-fg-muted text-xs">
        {summary.fullyReceivedItemCount} recebidos ·{" "}
        {summary.partiallyReceivedItemCount} parciais ·{" "}
        {summary.pendingItemCount} pendentes
      </span>
    </div>
  );
}

export function RoundRealizationSummary({
  realization,
  compact = false,
}: {
  realization: RoundReportRealization | null;
  compact?: boolean;
}) {
  if (!realization) return null;
  const summary = realization.summary;
  const hasReceipts = summary.postedReceiptCount > 0;

  return (
    <section className="border-border break-inside-avoid rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={compact ? "text-fg font-semibold" : "text-fg text-base font-semibold"}>
            Resultado após conferência
          </h2>
          <p className="text-fg-muted mt-1 text-sm">
            Quantidades e preços efetivamente confirmados no recebimento.
          </p>
        </div>
        <ReceiptPosition realization={realization} />
      </div>

      {hasReceipts ? (
        <>
          <div className={cn("mt-4 grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
            <RealizationMetric
              label="Economia negociada no recebido"
              value={summary.negotiatedSavingsOnReceived}
              detail="inicial x combinado, com quantidade real"
            />
            <RealizationMetric
              label="Economia realizada"
              value={summary.realizedSavings}
              detail="inicial x nota, com quantidade real"
            />
            <RealizationMetric
              label="Divergência nota x pedido"
              value={summary.divergenceImpact}
              detail="positivo indica valor pago a mais"
              inverse
            />
            <RealizationMetric
              label="Valor já conferido"
              value={summary.actualCost}
              detail={`${summary.postedReceiptCount} ${summary.postedReceiptCount === 1 ? "conferência" : "conferências"}`}
              neutral
            />
          </div>
          <p className="bg-info-soft text-fg mt-3 rounded-lg px-3 py-2 text-xs">
            A economia realizada já incorpora a divergência da nota. Ela
            substitui a estimativa na parte recebida; estes valores não devem
            ser somados entre si.
          </p>
          {summary.calculableReceivedItemCount < summary.receivedItemCount ? (
            <p className="border-warning/35 bg-warning/5 mt-3 rounded-lg border px-3 py-2 text-xs">
              {summary.receivedItemCount - summary.calculableReceivedItemCount}{" "}
              itens recebidos não possuem preço inicial suficiente para medir
              economia e ficaram fora desses totais.
            </p>
          ) : null}
          {realization.lastReceiptAt ? (
            <p className="text-fg-subtle mt-3 text-xs">
              Recebimentos considerados até{" "}
              {DATE_TIME.format(new Date(realization.lastReceiptAt))}.
            </p>
          ) : null}
        </>
      ) : (
        <p className="border-border bg-surface-sunken mt-4 rounded-lg border border-dashed px-3 py-4 text-sm">
          Ainda não há recebimento confirmado para esta cotação. A economia
          disponível acima continua sendo a posição conhecida na conclusão.
        </p>
      )}
    </section>
  );
}

function RealizationMetric({
  label,
  value,
  detail,
  inverse = false,
  neutral = false,
}: {
  label: string;
  value: number;
  detail: string;
  inverse?: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="border-border min-w-0 rounded-lg border p-3">
      <p className="text-fg-muted text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 wrap-anywhere text-lg font-semibold tabular-nums",
          neutral ? "text-fg" : resultClass(value, inverse),
        )}
      >
        {MONEY.format(value)}
      </p>
      <p className="text-fg-subtle text-xs">{detail}</p>
    </div>
  );
}

export function RoundRealizationDetails({
  realization,
}: {
  realization: RoundReportRealization | null;
}) {
  if (!realization || realization.summary.orderedItemCount === 0) return null;

  return (
    <section>
      <h2 className="text-fg mb-1 text-base font-semibold">
        Conferência por produto
      </h2>
      <p className="text-fg-muted mb-3 text-sm">
        A economia só aparece depois que a quantidade na unidade de preço é
        confirmada.
      </p>
      <div className="border-border overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
              <TableHead>Produto / fornecedor</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead className="text-right">Combinado</TableHead>
              <TableHead className="text-right">Nota</TableHead>
              <TableHead className="text-right">Economia realizada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {realization.items.map((item) => (
              <TableRow key={item.orderRevisionItemId} className="break-inside-avoid">
                <TableCell>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-fg-subtle text-xs">
                    {item.supplierName} · pedido #{item.orderNumber}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="tabular-nums">
                    {QTY.format(item.requestedQuantity)} {item.purchaseUnit}
                  </p>
                  <Badge variant="outline">
                    {receiptStatusLabel(item.receiptStatus)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.receiptStatus === "pending" ? (
                    <span className="text-fg-subtle">—</span>
                  ) : (
                    <>
                      <p className="tabular-nums">
                        {QTY.format(item.receivedQuantity)} {item.purchaseUnit}
                      </p>
                      <p className="text-fg-subtle text-xs tabular-nums">
                        {QTY.format(item.receivedPricingQuantity)} {item.pricingUnit}
                      </p>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <p>{MONEY.format(item.agreedPrice)}/{item.pricingUnit}</p>
                  {item.quotedPrice !== null ? (
                    <p className="text-fg-subtle text-xs">
                      inicial {MONEY.format(item.quotedPrice)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.practicedPrice === null
                    ? "—"
                    : `${MONEY.format(item.practicedPrice)}/${item.pricingUnit}`}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    item.realizedSavings === null
                      ? "text-fg-subtle"
                      : resultClass(item.realizedSavings),
                  )}
                >
                  {item.realizedSavings === null
                    ? "—"
                    : MONEY.format(item.realizedSavings)}
                  {item.realizedSavings !== null ? (
                    <span className="text-fg-subtle block text-xs font-normal">
                      negociada{" "}
                      {MONEY.format(item.negotiatedSavingsOnReceived ?? 0)} ·
                      divergência {MONEY.format(item.divergenceImpact ?? 0)}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
