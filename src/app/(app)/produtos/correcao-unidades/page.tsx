import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { BulkProductUnitEditor } from "@/components/products/bulk-product-unit-editor";
import { Button } from "@/components/ui/button";
import {
  listEditableProductUnits,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default function CorrecaoUnidadesPage() {
  return <BulkProductUnitContent />;
}

export async function BulkProductUnitContent({
  inModal = false,
}: {
  inModal?: boolean;
}) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("product.update")) redirect("/produtos");

  const [catalog, rawUnits] = await Promise.all([
    listEditableProductUnits(company.companyId),
    listUnits(company.companyId),
  ]);

  const units = rawUnits
    .filter((unit) => unit.is_active)
    .map((unit) => ({
      id: unit.id,
      code: unit.code,
      label: `${unit.code} — ${unit.name}`,
    }));

  const editor = (
    <BulkProductUnitEditor
      products={catalog.rows}
      units={units}
      lockedCount={catalog.lockedCount}
      inModal={inModal}
    />
  );

  if (inModal) return editor;

  return (
    <div className="w-full">
      <PageHeader
        title="Corrigir unidades em lote"
        description="Selecione grupos de produtos, aplique as unidades corretas e salve tudo uma única vez."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />
      {editor}
    </div>
  );
}
