import { Suspense } from "react";

import {
  ProductDeleteContent,
  ProductDeleteLoading,
} from "@/app/(app)/produtos/excluir/[id]/page";
import { RouteModal } from "@/components/layout/route-modal";

export default async function ExcluirProdutoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteModal
      titulo="Excluir produto"
      descricao="A exclusão é definitiva e só vale para produto sem história comercial."
      size="md"
      impedirFechamentoAcidental
    >
      <Suspense fallback={<ProductDeleteLoading inModal />}>
        <ProductDeleteContent id={id} inModal />
      </Suspense>
    </RouteModal>
  );
}
