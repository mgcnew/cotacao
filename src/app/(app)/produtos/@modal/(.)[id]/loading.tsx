import {
  CardSkeleton,
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import { DialogBody } from "@/components/ui/dialog";

/**
 * A caixa abre na hora; o histórico chega depois.
 *
 * É daqui que vem a agilidade: as consultas do produto somam três idas ao
 * banco e levam quase um segundo. Sem este esqueleto o clique ficaria parado
 * na lista até tudo terminar, que é a demora que se sentia na página inteira.
 */
export default function LoadingProdutoEmModal() {
  return (
    <RouteModal
      size="xl"
      titulo="Abrindo produto…"
      descricao="Carregando compras efetivas e histórico comercial."
    >
      <DialogBody className="space-y-4">
        <CardSkeleton lines={3} />
        <MetricsSkeleton count={4} />
        <TableSkeleton rows={5} columns={4} />
      </DialogBody>
    </RouteModal>
  );
}
