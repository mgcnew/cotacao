import { Suspense } from "react";

import { BulkProductUnitContent } from "@/app/(app)/produtos/correcao-unidades/page";
import { RouteModal } from "@/components/layout/route-modal";
import { DialogBody } from "@/components/ui/dialog";

export default function CorrecaoUnidadesEmModal() {
  return (
    <RouteModal
      titulo="Corrigir unidades em lote"
      descricao="Filtre, selecione e prepare várias correções antes de salvar uma única vez."
      size="xl"
      alturaEstavel
      impedirFechamentoAcidental
    >
      <Suspense
        fallback={
          <DialogBody>
            <div className="bg-surface-sunken h-80 animate-pulse rounded-lg" />
          </DialogBody>
        }
      >
        <BulkProductUnitContent inModal />
      </Suspense>
    </RouteModal>
  );
}

