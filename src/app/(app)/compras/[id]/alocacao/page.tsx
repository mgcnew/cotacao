import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  AllocateForm,
  ConfirmOrdersForm,
} from "@/components/allocations/allocation-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelAllocation } from "@/features/allocations/actions";
import {
  getAllocationBoard,
  listRoundOrders,
} from "@/features/allocations/queries";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";
import { getRound } from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export default async function AlocacaoPage({
  params,
}: PageProps<"/compras/[id]/alocacao">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [round, board, orders, permissions] = await Promise.all([
    getRound(company.companyId, id),
    getAllocationBoard(company.companyId, id),
    listRoundOrders(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  if (!round) notFound();
  if (!permissions.has("purchase_allocation.view")) redirect(`/compras/${id}`);

  const podeDecidir = permissions.has("purchase_allocation.create");
  const podeConfirmar =
    permissions.has("purchase_allocation.confirm") &&
    permissions.has("order.create");

  const { rows, suppliers, allocationsByItem } = board;
  const supplierName = new Map(
    suppliers.map((s) => [s.supplier_id, s.suppliers.name]),
  );

  const rascunhos = board.allocations.filter((a) => a.status === "draft");
  const fornecedoresNoRascunho = new Set(rascunhos.map((a) => a.supplierId));

  return (
    <div className="w-full">
      <PageHeader
        title="Decisão de compra"
        description={`${round.title} · escolha de quem comprar cada item, com divisão entre fornecedores quando fizer sentido`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/compras/${id}`}>Voltar à rodada</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/comparacao`}>Comparação</Link>
            </Button>
          </>
        }
      />

      {round.status !== "active" ? (
        <p className="border-border bg-surface-sunken text-fg-muted mb-6 rounded-xl border px-4 py-3 text-sm">
          Esta rodada está em <strong>{round.status}</strong>. Pedidos só podem
          ser gerados com a rodada em andamento.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Nada para decidir"
          description="A decisão de compra aparece quando a rodada tem itens e respostas de fornecedores."
        />
      ) : (
        <div className="mb-8 flex flex-col gap-4">
          {rows.map((row) => {
            // Só entram fornecedores que responderam com preço.
            const candidatos = suppliers
              .map((s) => {
                const cell = row.cells.get(s.id);
                if (!cell || cell.doesNotSupply || cell.currentPrice === null) {
                  return null;
                }
                return {
                  id: s.supplier_id,
                  name: s.suppliers.name,
                  price: cell.currentPrice,
                };
              })
              .filter((c) => c !== null);

            const decisoes = allocationsByItem.get(row.itemId) ?? [];
            const alocado = decisoes.reduce(
              (sum, d) => sum + d.allocatedQuantity,
              0,
            );
            const falta = row.requestedQuantity - alocado;

            return (
              <section
                key={row.itemId}
                className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-fg font-medium">{row.productName}</p>
                    <p className="text-fg-subtle text-xs">
                      {row.groupName} · precisa de{" "}
                      {QTY.format(row.requestedQuantity)} {row.purchaseUnit}
                    </p>
                  </div>
                  {alocado > 0 ? (
                    <Badge variant={falta === 0 ? "default" : "secondary"}>
                      {falta === 0
                        ? "coberto"
                        : falta > 0
                          ? `faltam ${QTY.format(falta)} ${row.purchaseUnit}`
                          : `${QTY.format(-falta)} ${row.purchaseUnit} a mais`}
                    </Badge>
                  ) : null}
                </div>

                {decisoes.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {decisoes.map((d) => (
                      <li
                        key={d.allocationId}
                        className="text-fg-muted flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span className="text-fg font-medium">
                          {supplierName.get(d.supplierId) ?? "—"}
                        </span>
                        <span className="tabular-nums">
                          {QTY.format(d.allocatedQuantity)} {row.purchaseUnit} ×{" "}
                          {MONEY.format(d.selectedPrice)} ={" "}
                          <span className="text-fg">
                            {MONEY.format(
                              d.allocatedQuantity * d.selectedPrice,
                            )}
                          </span>
                        </span>
                        <Badge
                          variant={
                            d.status === "confirmed" ? "default" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {d.status === "confirmed" ? "confirmada" : "rascunho"}
                        </Badge>
                        {/* Só rascunho se desfaz: confirmada já virou pedido. */}
                        {podeDecidir && d.status === "draft" ? (
                          <form
                            action={cancelAllocation.bind(
                              null,
                              d.allocationId,
                              id,
                            )}
                          >
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="text-fg-subtle hover:text-destructive h-6 px-1.5 text-xs"
                            >
                              Desfazer
                            </Button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {podeDecidir && round.status === "active" ? (
                  <AllocateForm
                    roundId={id}
                    quotationItemId={row.itemId}
                    productName={row.productName}
                    purchaseUnit={row.purchaseUnit}
                    suppliers={candidatos}
                    suggestedQuantity={
                      falta > 0 ? falta : row.requestedQuantity
                    }
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {podeConfirmar && rascunhos.length > 0 && round.status === "active" ? (
        <div className="mb-8">
          <ConfirmOrdersForm
            roundId={id}
            draftCount={rascunhos.length}
            supplierCount={fornecedoresNoRascunho.size}
          />
        </div>
      ) : null}

      {orders.length > 0 ? (
        <section>
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Pedidos gerados
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            Gerar o pedido não o envia. Cada um nasce em rascunho e fica parado
            até alguém abrir e mandar ao fornecedor.
          </p>
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <li
                key={order.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
              >
                <div>
                  <Link
                    href={`/pedidos/${order.id}`}
                    className="text-fg hover:text-primary font-medium underline-offset-4 hover:underline"
                  >
                    #{order.orderNumber} · {order.supplierName}
                  </Link>
                  <p className="text-fg-subtle text-xs">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
                    {order.deliveryDueDate
                      ? ` · entrega ${order.deliveryDueDate}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-fg font-medium tabular-nums">
                    {MONEY.format(order.total)}
                  </span>
                  <Badge
                    variant={order.status === "draft" ? "outline" : "secondary"}
                  >
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/pedidos/${order.id}`}>
                      {order.status === "draft" ? "Enviar" : "Abrir"}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
