import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { RoundForm } from "@/components/rounds/round-forms";
import { Button } from "@/components/ui/button";
import { getSupplier } from "@/features/suppliers/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function NovaRodadaPage({
  searchParams,
}: PageProps<"/compras/nova">) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  const query = await searchParams;

  if (!permissions.has("purchase_round.create")) {
    redirect("/compras");
  }

  const requestedSupplier = Array.isArray(query.fornecedor)
    ? query.fornecedor[0]
    : query.fornecedor;
  const parsedSupplier = z.uuid().safeParse(requestedSupplier);
  const supplier = parsedSupplier.success
    ? await getSupplier(company.companyId, parsedSupplier.data)
    : null;
  const initialSupplierId =
    supplier?.status === "active" ? supplier.id : undefined;
  const requestedSchedule = Array.isArray(query.agenda)
    ? query.agenda[0]
    : query.agenda;
  const parsedSchedule = z.uuid().safeParse(requestedSchedule);
  const initialScheduleId =
    initialSupplierId && parsedSchedule.success
      ? parsedSchedule.data
      : undefined;
  const initialTitle = supplier ? `Cotação ${supplier.name}` : undefined;

  return (
    <div className="w-full">
      <PageHeader
        title="Nova rodada de compras"
        description="Primeiro o título. Grupos, produtos e fornecedores entram na sequência, com a rodada ainda em preparação."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/compras">Cancelar</Link>
          </Button>
        }
      />
      <RoundForm
        initialSupplierId={initialSupplierId}
        initialScheduleId={initialScheduleId}
        initialTitle={initialTitle}
      />
    </div>
  );
}
