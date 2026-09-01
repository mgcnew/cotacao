import { Suspense } from "react";

import {
  ProductUnitEditContent,
  ProductUnitEditLoading,
} from "@/app/(app)/produtos/editar/[id]/page";
import { RouteModal } from "@/components/layout/route-modal";

export default async function EditarUnidadesProdutoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteModal
      titulo="Editar unidades do produto"
      descricao="A correção afeta somente usos futuros e é bloqueada quando já existe movimentação."
      size="lg"
      impedirFechamentoAcidental
    >
      <Suspense fallback={<ProductUnitEditLoading inModal />}>
        <ProductUnitEditContent id={id} inModal />
      </Suspense>
    </RouteModal>
  );
}
