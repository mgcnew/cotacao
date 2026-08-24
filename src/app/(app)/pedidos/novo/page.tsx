import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  DirectOrderForm,
  FaltaCadastro,
} from "@/components/orders/direct-order-form";
import { Button } from "@/components/ui/button";
import { listDirectOrderOptions } from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * O pedido direto em tela cheia.
 *
 * Destino de F5, de link colado e de quem chega de fora de `/pedidos` — o card
 * do painel, por exemplo. Vindo da lista, esta mesma URL abre em modal por
 * cima dela; o formulário é o mesmo componente nos dois casos, e ele próprio
 * sabe que aqui criar abre o pedido.
 */
export default async function NovoPedidoPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.create")) redirect("/pedidos");

  const options = await listDirectOrderOptions(company.companyId);
  const { suppliers, products } = options;

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
        <DirectOrderForm {...options} />
      )}
    </div>
  );
}
