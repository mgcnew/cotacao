import { FolderTree } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { Button } from "@/components/ui/button";
import {
  listAttributeDefinitions,
  listCategories,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function NovoProdutoPage() {
  const company = await requireActiveCompany();
  const [categories, units, attributes, permissions] = await Promise.all([
    listCategories(company.companyId),
    listUnits(company.companyId),
    listAttributeDefinitions(company.companyId),
    getPermissions(company.companyId),
  ]);

  // A RLS negaria o insert de qualquer forma; isto evita mostrar um formulário
  // que só falharia no fim.
  if (!permissions.has("product.create")) {
    redirect("/produtos");
  }

  // Só oferece o que ainda está em uso — desativado não entra em cadastro novo.
  const categoriasAtivas = categories
    .filter((c) => c.isActive)
    .map((c) => ({ id: c.id, label: c.name }));

  const unidadesAtivas = units
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, label: `${u.name} (${u.symbol})` }));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Novo produto"
        description="Catálogo único: revenda e uso interno no mesmo lugar, separados pela finalidade."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Cancelar</Link>
          </Button>
        }
      />

      {categoriasAtivas.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Cadastre uma categoria primeiro"
          description="Todo produto pertence a uma categoria, e nenhuma está ativa nesta empresa."
          action={
            <Button asChild size="sm">
              <Link href="/produtos/categorias">Ir para categorias</Link>
            </Button>
          }
        />
      ) : (
        <ProductForm
          categories={categoriasAtivas}
          units={unidadesAtivas}
          attributes={attributes
            .filter((a) => a.isActive)
            .map((a) => ({
              id: a.id,
              categoryId: a.categoryId,
              name: a.name,
              dataType: a.dataType,
              unitSymbol: a.unitSymbol,
              isRequired: a.isRequired,
            }))}
        />
      )}
    </div>
  );
}
