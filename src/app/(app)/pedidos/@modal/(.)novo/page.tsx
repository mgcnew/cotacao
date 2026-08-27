import { Suspense } from "react";
import { z } from "zod";

import { FormSkeleton } from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import {
  DirectOrderForm,
  FaltaCadastro,
} from "@/components/orders/direct-order-form";
import { DialogBody } from "@/components/ui/dialog";
import { listDirectOrderOptions } from "@/features/orders/queries";
import { getSupplierScheduleTemplateItems } from "@/features/suppliers/schedules";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * O pedido direto por cima da lista.
 *
 * A casca não espera por nada — precisa aparecer no instante do clique. O
 * formulário depende de duas consultas (fornecedores e produtos) e chega
 * depois, com esqueleto no lugar.
 *
 * Sem permissão, a caixa diz isso em vez de desviar: um `redirect` aqui
 * arrastaria o router e levaria embora a lista que está atrás.
 */
export default function NovoPedidoEmModal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <RouteModal
      titulo="Novo pedido"
      descricao="Compra fechada por fora da cotação — por telefone, no balcão, ou a reposição de sempre. Daqui ele segue o mesmo caminho: enviar, confirmar, receber."
    >
      <Suspense
        fallback={
          <DialogBody>
            <FormSkeleton fields={3} />
          </DialogBody>
        }
      >
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </RouteModal>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  const query = await searchParams;

  if (!permissions.has("order.create")) {
    return (
      <DialogBody>
        <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
          Seu papel não permite criar pedidos.
        </p>
      </DialogBody>
    );
  }

  const options = await listDirectOrderOptions(company.companyId);
  const { suppliers, products } = options;
  const requestedSupplier = Array.isArray(query.fornecedor)
    ? query.fornecedor[0]
    : query.fornecedor;
  const initialSupplierId = suppliers.some(
    (supplier) => supplier.id === requestedSupplier,
  )
    ? requestedSupplier
    : undefined;
  const requestedSchedule = Array.isArray(query.agenda)
    ? query.agenda[0]
    : query.agenda;
  const parsedSchedule = z.uuid().safeParse(requestedSchedule);
  const templateItems =
    initialSupplierId && parsedSchedule.success
      ? await getSupplierScheduleTemplateItems(
          company.companyId,
          parsedSchedule.data,
          initialSupplierId,
        )
      : [];
  const initialItems = templateItems
    .filter((item) => item.isActive)
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price: "",
      notes: item.notes ?? "",
    }));

  if (suppliers.length === 0 || products.length === 0) {
    return (
      <DialogBody>
        <FaltaCadastro {...options} />
      </DialogBody>
    );
  }

  return (
    <DirectOrderForm
      {...options}
      initialSupplierId={initialSupplierId}
      initialItems={initialItems}
    />
  );
}
