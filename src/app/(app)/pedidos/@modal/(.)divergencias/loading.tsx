import {
  MetricsSkeleton,
  TableSkeleton,
} from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import { DialogBody } from "@/components/ui/dialog";

export default function LoadingDivergenciasEmModal() {
  return (
    <RouteModal
      size="xl"
      titulo="Divergências do recebimento"
      descricao="Carregando as decisões comerciais pendentes."
    >
      <DialogBody className="space-y-4">
        <MetricsSkeleton count={3} />
        <TableSkeleton rows={4} columns={4} />
      </DialogBody>
    </RouteModal>
  );
}
