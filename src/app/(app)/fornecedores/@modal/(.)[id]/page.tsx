import { Suspense } from "react";

import { FornecedorContent } from "@/app/(app)/fornecedores/[id]/page";
import { CardSkeleton, SectionTitleSkeleton } from "@/components/layout/page-skeleton";
import { DialogBody } from "@/components/ui/dialog";
import { parseSupplierTab } from "@/features/suppliers/tabs";

/**
 * O cadastro do fornecedor — a view padrão do modal.
 *
 * Quatro das cinco abas passam por aqui — cadastro, contatos, modelo de compra
 * e avisos — escolhidas por `?aba=`. Só o miolo: a casca do diálogo e a faixa
 * de abas moram no `layout.tsx` ao lado, e é o que faz trocar de aba mudar o
 * conteúdo sem fechar nada.
 */
export default async function FornecedorEmModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  return (
    <Suspense
      fallback={
        <DialogBody className="flex flex-col gap-4">
          <CardSkeleton lines={3} />
          <SectionTitleSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </DialogBody>
      }
    >
      <FornecedorContent id={id} aba={parseSupplierTab(query)} emModal />
    </Suspense>
  );
}
