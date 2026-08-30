import { PedidoContent } from "@/app/(app)/pedidos/[id]/page";

export default async function PedidoEmModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PedidoContent id={id} emModal />;
}
