import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOrders, ORDER_STATUS_LABEL } from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function PedidosPage() {
  const company = await requireActiveCompany();
  const [orders, permissions] = await Promise.all([
    listOrders(company.companyId),
    getPermissions(company.companyId),
  ]);

  if (!permissions.has("order.view")) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Pedidos"
        description="Da geração ao recebimento. O pedido é enviado ao fornecedor, confirmado por ele, e só então a mercadoria pode dar entrada."
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum pedido ainda"
          description="Pedidos nascem da decisão de compra de uma rodada, na tela de alocação."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    href={`/pedidos/${order.id}`}
                    className="text-fg hover:text-primary font-medium"
                  >
                    #{order.orderNumber}
                  </Link>
                  {order.roundTitle ? (
                    <span className="text-fg-subtle block text-xs">
                      {order.roundTitle}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {order.supplierName}
                </TableCell>
                <TableCell className="text-fg-muted text-xs">
                  {order.deliveryDueDate ?? "—"}
                </TableCell>
                <TableCell className="text-fg-muted text-right tabular-nums">
                  {order.itemCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {MONEY.format(order.total)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      order.status === "received" ? "default" : "secondary"
                    }
                  >
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
