import { Building2, CalendarDays, Link2Off, PackageCheck } from "lucide-react";

import { ConfirmOrderForm } from "@/components/orders/confirm-order-form";
import { ReportDivergenceForm } from "@/components/orders/divergence-forms";
import { getPublicOrder } from "@/features/orders/public";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

/** Confirmação do pedido pelo fornecedor — pública, sem login. */
export default async function PedidoPublicoPage({
  params,
}: PageProps<"/o/[token]">) {
  const { token } = await params;
  const data = await getPublicOrder(token);

  if (!data) {
    return (
      <main className="bg-surface-sunken flex min-h-screen items-center justify-center px-6 py-12">
        <div className="border-border bg-surface flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <div className="bg-surface-muted text-fg-subtle grid size-10 place-items-center rounded-lg">
            <Link2Off className="size-5" aria-hidden />
          </div>
          <p className="text-fg font-medium">Link inválido ou expirado</p>
          <p className="text-fg-muted text-sm">
            Peça um novo link ao comprador que enviou este pedido.
          </p>
        </div>
      </main>
    );
  }

  const itemTotals = data.revision.items.map((item) => {
    const pricingQuantity =
      item.estimated_pricing_quantity != null
        ? Number(item.estimated_pricing_quantity)
        : item.purchase_unit.symbol === item.pricing_unit.symbol
          ? Number(item.requested_quantity)
          : null;
    return {
      id: item.order_revision_item_id,
      total:
        pricingQuantity === null
          ? null
          : pricingQuantity * Number(item.agreed_price),
    };
  });
  const totalCalculavel = itemTotals.every((item) => item.total !== null);
  const total = itemTotals.reduce(
    (sum, item) => sum + Number(item.total ?? 0),
    0,
  );
  const packagingItems = data.revision.items.filter(
    (item) => item.packaging_presentation !== null,
  );

  return (
    <main className="bg-surface-sunken min-h-dvh px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="border-border bg-surface mb-4 overflow-hidden rounded-2xl border shadow-xs sm:mb-6">
          <div className="border-border border-b p-4 sm:p-5">
            <p className="text-primary text-[11px] font-semibold tracking-[0.14em] uppercase">
              Confirmação de pedido
            </p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-fg text-2xl font-semibold tracking-tight">
                  Pedido #{data.order.order_number}
                </h1>
                <p className="text-fg-muted mt-1 text-sm">
                  Confira os produtos, quantidades, preços e prazo antes de
                  confirmar.
                </p>
              </div>
              <span className="bg-primary-soft text-primary rounded-full px-3 py-1 text-xs font-medium">
                Revisão {data.revision.revision_number}
              </span>
            </div>
          </div>
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
            <div className="flex items-start gap-2.5">
              <Building2
                className="text-fg-subtle mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <div>
                <p className="text-fg-subtle text-xs">Comprador</p>
                <p className="text-fg font-medium">{data.company.name}</p>
                <p className="text-fg-muted text-xs">
                  Para {data.supplier.name}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarDays
                className="text-fg-subtle mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <div>
                <p className="text-fg-subtle text-xs">Entrega prevista</p>
                <p className="text-fg font-medium">
                  {data.revision.delivery_due_date
                    ? DATE.format(
                        new Date(`${data.revision.delivery_due_date}T12:00:00`),
                      )
                    : "Prazo a combinar"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="border-border bg-surface mb-4 overflow-hidden rounded-2xl border shadow-xs sm:mb-6">
          <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <PackageCheck className="text-primary size-4" aria-hidden />
              <h2 className="text-fg text-sm font-semibold">Itens do pedido</h2>
            </div>
            <span className="text-fg-muted text-xs">
              {data.revision.items.length}{" "}
              {data.revision.items.length === 1 ? "item" : "itens"}
            </span>
          </header>
          <ul className="divide-border divide-y">
            {data.revision.items.map((item) => (
              <li
                key={item.order_revision_item_id}
                className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-fg font-medium">{item.product_name}</p>
                  {item.notes ? (
                    <p className="text-fg-subtle mt-0.5 text-xs">
                      {item.notes}
                    </p>
                  ) : null}
                  {item.packaging_presentation ? (
                    <div className="border-primary/20 bg-primary-soft mt-2 inline-flex flex-col rounded-lg border px-2.5 py-1.5 text-xs">
                      <span className="text-fg-muted">Apresentação confirmada na cotação</span>
                      <strong className="text-primary mt-0.5 tabular-nums">
                        {QTY.format(item.packaging_presentation.quantity_per_package)} {item.packaging_presentation.comparison_unit_symbol} por pacote
                      </strong>
                    </div>
                  ) : null}
                </div>
                <div className="sm:text-right">
                  <p className="text-fg tabular-nums">
                    <strong>
                      {QTY.format(Number(item.requested_quantity))}
                    </strong>{" "}
                    {item.purchase_unit.symbol}
                  </p>
                  <p className="text-fg-muted text-xs tabular-nums">
                    {MONEY.format(Number(item.agreed_price))} por{" "}
                    {item.pricing_unit.symbol}
                  </p>
                  {itemTotals.find(
                    (total) => total.id === item.order_revision_item_id,
                  )?.total !== null ? (
                    <p className="text-fg-subtle mt-0.5 text-xs tabular-nums">
                      Estimado{" "}
                      {MONEY.format(
                        Number(
                          itemTotals.find(
                            (total) => total.id === item.order_revision_item_id,
                          )?.total,
                        ),
                      )}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="border-border bg-surface-sunken flex items-center justify-between gap-4 border-t px-4 py-3 sm:px-5">
            <div>
              <span className="text-fg text-sm font-medium">
                {totalCalculavel ? "Total estimado" : "Total variável"}
              </span>
              {!totalCalculavel ? (
                <p className="text-fg-subtle text-xs">
                  Há item cujo valor depende de peso ou conversão na entrega.
                </p>
              ) : null}
            </div>
            <span className="text-fg text-lg font-semibold tabular-nums">
              {totalCalculavel ? MONEY.format(total) : "A calcular"}
            </span>
          </div>
        </section>

        <section className="border-border bg-surface rounded-2xl border p-4 shadow-xs sm:p-5">
          <div className="mb-4">
            <h2 className="text-fg text-sm font-semibold">Sua decisão</h2>
            <p className="text-fg-muted mt-1 text-sm">
              Confirme somente se todos os dados estiverem corretos. Se houver
              qualquer diferença, avise o comprador antes.
            </p>
          </div>
          <ConfirmOrderForm
            token={token}
            alreadyConfirmed={data.revision.status === "confirmed"}
            packagingPresentations={packagingItems.map((item) => ({
              productName: item.product_name,
              quantity: item.packaging_presentation!.quantity_per_package,
              unit: item.packaging_presentation!.comparison_unit_symbol,
            }))}
          />

          {data.revision.status === "sent" ? (
            <div className="border-border mt-4 border-t pt-4">
              <ReportDivergenceForm
                token={token}
                buttonLabel={
                  packagingItems.length > 0
                    ? "A apresentação ou outro dado mudou"
                    : "Algo está errado neste pedido"
                }
                defaultType={packagingItems.length > 0 ? "specification" : ""}
                defaultItemId={
                  packagingItems.length === 1
                    ? packagingItems[0].order_revision_item_id
                    : ""
                }
                items={data.revision.items.map((i) => ({
                  id: i.order_revision_item_id,
                  name: i.product_name,
                }))}
              />
            </div>
          ) : null}
        </section>

        {data.revision.status === "contested" ? (
          <p className="border-border bg-warning-soft text-warning mt-4 rounded-xl border px-4 py-4 text-center text-sm">
            Você apontou uma divergência neste pedido. O comprador está
            analisando e vai retomar o contato.
          </p>
        ) : null}

        <p className="text-fg-subtle mt-6 text-center text-xs sm:mt-8">
          Este link é pessoal e identifica sua empresa. Não repasse.
        </p>
      </div>
    </main>
  );
}
