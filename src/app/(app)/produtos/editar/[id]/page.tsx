import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProductEditForm } from "@/components/products/product-edit-form";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import {
  getProductEditContext,
  listAttributeDefinitions,
  listCategories,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditContent id={id} />;
}

export async function ProductEditContent({
  id,
  inModal = false,
}: {
  id: string;
  inModal?: boolean;
}) {
  const company = await requireActiveCompany();
  const [context, rawCategories, rawUnits, attributes, permissions] =
    await Promise.all([
      getProductEditContext(company.companyId, id),
      listCategories(company.companyId),
      listUnits(company.companyId),
      listAttributeDefinitions(company.companyId),
      getPermissions(company.companyId),
    ]);
  if (!context) notFound();
  if (!permissions.has("product.update")) redirect("/produtos");

  // Inativo não entra em cadastro novo, mas precisa continuar aparecendo se é o
  // que este produto já usa — senão a edição de nome trocaria a categoria por
  // baixo do pano só porque ela saiu de circulação.
  const categories = rawCategories
    .filter((c) => c.isActive || c.id === context.product.categoryId)
    .map((c) => ({
      id: c.id,
      label: `${c.name}${c.isActive ? "" : " (inativa)"}`,
    }));

  const emUso = new Set([
    context.product.purchaseUnitId,
    context.product.pricingUnitId,
    context.product.comparisonUnitId,
  ]);
  const units = rawUnits
    .filter((unit) => unit.is_active || emUso.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      label: `${unit.name} (${unit.symbol})${unit.is_active ? "" : " — inativa"}`,
    }));

  const form = (
    <ProductEditForm
      context={context}
      categories={categories}
      units={units}
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
      inModal={inModal}
    />
  );

  if (inModal) return form;

  return (
    <div className="w-full">
      <PageHeader
        title={`Editar — ${context.product.name}`}
        description="Nome, categoria e finalidade se corrigem a qualquer momento. As unidades, somente enquanto ninguém tiver cotado ou pedido sob elas."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar</Link>
          </Button>
        }
      />
      {form}
    </div>
  );
}

export function ProductEditLoading({ inModal = false }) {
  const content = (
    <div className="flex flex-col gap-6">
      <div className="bg-surface-sunken h-36 animate-pulse rounded-xl" />
      <div className="bg-surface-sunken h-40 animate-pulse rounded-xl" />
      <div className="bg-surface-sunken h-24 animate-pulse rounded-xl" />
    </div>
  );
  return inModal ? <DialogBody>{content}</DialogBody> : content;
}
