import { CardSkeleton, TableSkeleton } from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import { DialogBody } from "@/components/ui/dialog";

export default function LoadingPedidoEmModal() {
  return (
    <RouteModal
      size="xl"
      titulo="Abrindo pedido…"
      descricao="Carregando produtos, recebimentos e histórico."
    >
      <DialogBody className="space-y-4">
        <CardSkeleton lines={4} />
        <TableSkeleton rows={4} columns={3} />
      </DialogBody>
    </RouteModal>
  );
}
