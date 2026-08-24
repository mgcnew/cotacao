import { Suspense } from "react";

import { FormSkeleton } from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import { ProductForm } from "@/components/products/product-form";
import { DialogBody } from "@/components/ui/dialog";
import {
  listAttributeDefinitions,
  listCategories,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default function NovoProdutoEmModal() {
  return (
    <RouteModal
      titulo="Novo produto"
      descricao="Cadastre o item, sua finalidade e as unidades usadas na compra e na comparação."
      impedirFechamentoAcidental
    >
      <Suspense
        fallback={
          <DialogBody>
            <FormSkeleton fields={6} />
          </DialogBody>
        }
      >
        <Conteudo />
      </Suspense>
    </RouteModal>
  );
}

async function Conteudo() {
  const company = await requireActiveCompany();
  const [categories, units, attributes, permissions] = await Promise.all([
    listCategories(company.companyId),
    listUnits(company.companyId),
    listAttributeDefinitions(company.companyId),
    getPermissions(company.companyId),
  ]);

  if (!permissions.has("product.create")) {
    return (
      <DialogBody>
        <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
          Seu papel não permite criar produtos.
        </p>
      </DialogBody>
    );
  }

  return (
    <ProductForm
      categories={categories
        .filter((category) => category.isActive)
        .map((category) => ({ id: category.id, label: category.name }))}
      units={units
        .filter((unit) => unit.is_active)
        .map((unit) => ({
          id: unit.id,
          label: `${unit.name} (${unit.symbol})`,
        }))}
      attributes={attributes
        .filter((attribute) => attribute.isActive)
        .map((attribute) => ({
          id: attribute.id,
          categoryId: attribute.categoryId,
          name: attribute.name,
          dataType: attribute.dataType,
          unitSymbol: attribute.unitSymbol,
          isRequired: attribute.isRequired,
        }))}
    />
  );
}
