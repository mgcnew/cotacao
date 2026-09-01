import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProductUnitEditForm } from "@/components/products/product-unit-edit-form";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import {
  getProductUnitEditContext,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function EditarUnidadesProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductUnitEditContent id={id} />;
}

export async function ProductUnitEditContent({
  id,
  inModal = false,
}: {
  id: string;
  inModal?: boolean;
}) {
  const company = await requireActiveCompany();
  const [context, rawUnits, permissions] = await Promise.all([
    getProductUnitEditContext(company.companyId, id),
    listUnits(company.companyId),
    getPermissions(company.companyId),
  ]);
  if (!context) notFound();
  if (!permissions.has("product.update")) redirect("/produtos");

  const selectedIds = new Set([
    context.product.purchaseUnitId,
    context.product.pricingUnitId,
    context.product.comparisonUnitId,
  ]);
  const units = rawUnits
    .filter((unit) => unit.is_active || selectedIds.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      label: `${unit.code} — ${unit.name}${unit.is_active ? "" : " (inativa)"}`,
    }));

  if (inModal) {
    return (
      <ProductUnitEditForm
        product={context.product}
        units={units}
        lockReason={context.lockReason}
        inModal
      />
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title={`Editar unidades — ${context.product.name}`}
        description="Correção disponível somente enquanto o produto ainda não possui movimentação operacional."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar</Link>
          </Button>
        }
      />
      <ProductUnitEditForm
        product={context.product}
        units={units}
        lockReason={context.lockReason}
      />
    </div>
  );
}

export function ProductUnitEditLoading({ inModal = false }) {
  const content = (
    <div className="space-y-4">
      <div className="bg-surface-sunken h-12 animate-pulse rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="bg-surface-sunken h-16 animate-pulse rounded-lg"
          />
        ))}
      </div>
    </div>
  );
  return inModal ? <DialogBody>{content}</DialogBody> : content;
}
