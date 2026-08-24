import { Suspense } from "react";

import { FormSkeleton } from "@/components/layout/page-skeleton";
import { RouteModal } from "@/components/layout/route-modal";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { DialogBody } from "@/components/ui/dialog";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default function NovoFornecedorEmModal() {
  return (
    <RouteModal
      titulo="Novo fornecedor"
      descricao="Cadastre os dados da empresa e o contato que receberá as cotações."
      impedirFechamentoAcidental
    >
      <Suspense
        fallback={
          <DialogBody>
            <FormSkeleton fields={6} />
          </DialogBody>
        }
      >
        <Conteudo />
      </Suspense>
    </RouteModal>
  );
}

async function Conteudo() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  if (!permissions.has("supplier.create")) {
    return (
      <DialogBody>
        <p className="border-border bg-surface-sunken text-fg-muted rounded-xl border px-4 py-3 text-sm">
          Seu papel não permite criar fornecedores.
        </p>
      </DialogBody>
    );
  }

  return <SupplierForm />;
}
