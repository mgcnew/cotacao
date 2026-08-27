import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import {
  DirectOrderForm,
  FaltaCadastro,
} from "@/components/orders/direct-order-form";
import { Button } from "@/components/ui/button";
import { listDirectOrderOptions } from "@/features/orders/queries";
import { getSupplierScheduleTemplateItems } from "@/features/suppliers/schedules";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * O pedido direto em tela cheia.
 *
 * Destino de F5, de link colado e de quem chega de fora de `/pedidos` — o card
 * do painel, por exemplo. Vindo da lista, esta mesma URL abre em modal por
 * cima dela; o formulário é o mesmo componente nos dois casos, e ele próprio
 * sabe que aqui criar abre o pedido.
 */
export default async function NovoPedidoPage({
  searchParams,
}: PageProps<"/pedidos/novo">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  const query = await searchParams;

  if (!permissions.has("order.create")) redirect("/pedidos");

  const options = await listDirectOrderOptions(company.companyId);
  const { suppliers, products } = options;
  const requestedSupplier = Array.isArray(query.fornecedor)
    ? query.fornecedor[0]
    : query.fornecedor;
  const initialSupplierId = suppliers.some(
    (supplier) => supplier.id === requestedSupplier,
  )
    ? requestedSupplier
    : undefined;
  const requestedSchedule = Array.isArray(query.agenda)
    ? query.agenda[0]
    : query.agenda;
  const parsedSchedule = z.uuid().safeParse(requestedSchedule);
  const templateItems =
    initialSupplierId && parsedSchedule.success
      ? await getSupplierScheduleTemplateItems(
          company.companyId,
          parsedSchedule.data,
          initialSupplierId,
        )
      : [];
  const initialItems = templateItems
    .filter((item) => item.isActive)
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price: "",
      notes: item.notes ?? "",
    }));

  return (
    <div className="w-full">
      <PageHeader
        title="Novo pedido"
        description="Compra fechada por fora da cotação — por telefone, no balcão, ou a reposição de sempre. O pedido segue o mesmo caminho: enviar, confirmar, receber."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/pedidos">Cancelar</Link>
          </Button>
        }
      />

      {suppliers.length === 0 || products.length === 0 ? (
        <FaltaCadastro {...options} />
      ) : (
        <DirectOrderForm
          {...options}
          initialSupplierId={initialSupplierId}
          initialItems={initialItems}
        />
      )}
    </div>
  );
}
