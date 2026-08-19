import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { RoundForm } from "@/components/rounds/round-forms";
import { Button } from "@/components/ui/button";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function NovaRodadaPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("purchase_round.create")) {
    redirect("/compras");
  }

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
      <RoundForm />
    </div>
  );
}
