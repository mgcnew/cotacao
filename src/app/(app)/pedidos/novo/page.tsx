import { PackagePlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { DirectOrderForm } from "@/components/orders/direct-order-form";
import { Button } from "@/components/ui/button";
import { listDirectOrderOptions } from "@/features/orders/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function NovoPedidoPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("order.create")) redirect("/pedidos");

  const { suppliers, products } = await listDirectOrderOptions(
    company.companyId,
  );

  const faltaCadastro = suppliers.length === 0 || products.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Novo pedido"
        description="Compra fechada por fora da cotação — por telefone, no balcão, ou reposição de sempre. O pedido segue o mesmo caminho: enviar, confirmar, receber."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/pedidos">Cancelar</Link>
          </Button>
        }
      />

      {faltaCadastro ? (
        <EmptyState
          icon={PackagePlus}
          title="Falta cadastro para montar o pedido"
          description={
            suppliers.length === 0
              ? "Nenhum fornecedor ativo. Cadastre o fornecedor antes de comprar dele."
              : "Nenhum produto ativo. O pedido grava as unidades do cadastro do produto, então ele precisa existir primeiro."
          }
          action={
            <Button asChild size="sm">
              <Link
                href={suppliers.length === 0 ? "/fornecedores/novo" : "/produtos/novo"}
              >
                {suppliers.length === 0
                  ? "Cadastrar fornecedor"
                  : "Cadastrar produto"}
              </Link>
            </Button>
          }
        />
      ) : (
        <DirectOrderForm suppliers={suppliers} products={products} />
      )}
    </div>
  );
}
