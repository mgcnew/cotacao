import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProductDeleteForm } from "@/components/products/product-delete-form";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import { getProductDeleteContext } from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function ExcluirProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDeleteContent id={id} />;
}

export async function ProductDeleteContent({
  id,
  inModal = false,
}: {
  id: string;
  inModal?: boolean;
}) {
  const company = await requireActiveCompany();
  const [context, permissions] = await Promise.all([
    getProductDeleteContext(company.companyId, id),
    getPermissions(company.companyId),
  ]);
  if (!context) notFound();
  if (!permissions.has("product.delete")) redirect("/produtos");

  if (inModal) {
    return <ProductDeleteForm context={context} inModal />;
  }

  return (
    <div className="w-full">
      <PageHeader
        title={`Excluir — ${context.product.name}`}
        description="A exclusão só é permitida enquanto nenhuma cotação respondida, pedido enviado ou nota fiscal conferida depender do produto."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar</Link>
          </Button>
        }
      />
      <ProductDeleteForm context={context} />
    </div>
  );
}

export function ProductDeleteLoading({ inModal = false }) {
  const content = (
    <div className="space-y-4">
      <div className="bg-surface-sunken h-16 animate-pulse rounded-lg" />
      <div className="bg-surface-sunken h-12 animate-pulse rounded-lg" />
    </div>
  );
  return inModal ? <DialogBody>{content}</DialogBody> : content;
}
