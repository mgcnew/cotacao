import { Link2Off } from "lucide-react";

import { ConfirmOrderForm } from "@/components/orders/confirm-order-form";
import { ReportDivergenceForm } from "@/components/orders/divergence-forms";
import { getPublicOrder } from "@/features/orders/public";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

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

  const total = data.revision.items.reduce(
    (sum, i) => sum + Number(i.requested_quantity) * Number(i.agreed_price),
    0,
  );

  return (
    <main className="bg-surface-sunken min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <p className="text-fg-subtle text-xs tracking-wider uppercase">
            Pedido de compra
          </p>
          <h1 className="text-fg mt-1 text-xl font-semibold tracking-tight">
            #{data.order.order_number}
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            {data.company.name} está confirmando este pedido com{" "}
            {data.supplier.name}.
            {data.revision.delivery_due_date
              ? ` Entrega prevista para ${data.revision.delivery_due_date}.`
              : ""}
          </p>
        </header>

        <section className="border-border bg-surface mb-6 rounded-xl border p-4">
          <ul className="flex flex-col gap-3">
            {data.revision.items.map((item) => (
              <li
                key={item.order_revision_item_id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <div>
                  <p className="text-fg font-medium">{item.product_name}</p>
                  {item.notes ? (
                    <p className="text-fg-subtle text-xs">{item.notes}</p>
                  ) : null}
                </div>
                <p className="text-fg-muted tabular-nums">
                  {QTY.format(Number(item.requested_quantity))}{" "}
                  {item.purchase_unit.symbol} ×{" "}
                  {MONEY.format(Number(item.agreed_price))}/
                  {item.pricing_unit.symbol}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-fg-muted text-sm">Total</span>
            <span className="text-fg font-semibold tabular-nums">
              {MONEY.format(total)}
            </span>
          </div>
        </section>

        <ConfirmOrderForm
          token={token}
          alreadyConfirmed={data.revision.status === "confirmed"}
        />

        {/* Só faz sentido contestar o que ainda está em aberto. */}
        {data.revision.status === "sent" ? (
          <div className="mt-4">
            <ReportDivergenceForm
              token={token}
              items={data.revision.items.map((i) => ({
                id: i.order_revision_item_id,
                name: i.product_name,
              }))}
            />
          </div>
        ) : null}

        {data.revision.status === "contested" ? (
          <p className="border-border bg-surface text-fg-muted mt-4 rounded-xl border px-4 py-4 text-center text-sm">
            Você apontou uma divergência neste pedido. O comprador está
            analisando e vai retomar o contato.
          </p>
        ) : null}

        <p className="text-fg-subtle mt-8 text-center text-xs">
          Este link é pessoal e identifica sua empresa. Não repasse.
        </p>
      </div>
    </main>
  );
}
