import { Suspense } from "react";

import {
  ProductEditContent,
  ProductEditLoading,
} from "@/app/(app)/produtos/editar/[id]/page";
import { RouteModal } from "@/components/layout/route-modal";

export default async function EditarProdutoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteModal
      titulo="Editar produto"
      descricao="Nome, categoria e finalidade se corrigem sempre. As unidades, só enquanto ninguém tiver cotado ou pedido sob elas."
      size="lg"
      impedirFechamentoAcidental
    >
      <Suspense fallback={<ProductEditLoading inModal />}>
        <ProductEditContent id={id} inModal />
      </Suspense>
    </RouteModal>
  );
}
