import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { Button } from "@/components/ui/button";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function NovoFornecedorPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("supplier.create")) {
    redirect("/fornecedores");
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Novo fornecedor"
        description="Dados da empresa e o contato por onde a cotação chega, no mesmo formulário. Categorias atendidas e agenda de compras vêm na ficha, depois."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/fornecedores">Cancelar</Link>
          </Button>
        }
      />
      <SupplierForm />
    </div>
  );
}
