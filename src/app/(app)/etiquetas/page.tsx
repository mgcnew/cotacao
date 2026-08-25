import { Smartphone } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { MobileBarcodeDisplay } from "@/components/products/mobile-barcode-display";
import { listShoppingProducts } from "@/features/shopping-list/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function EtiquetasPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("product.view")) redirect("/dashboard");

  const products = await listShoppingProducts(company.companyId);

  return (
    <div className="w-full">
      <div className="md:hidden">
        <PageHeader
          title="Código para etiquetas"
          description="Leia a embalagem e mostre o código ao leitor do sistema de etiquetas."
        />
        <MobileBarcodeDisplay products={products} />
      </div>

      <div className="border-border bg-surface mx-auto hidden max-w-lg rounded-2xl border p-8 text-center md:block">
        <Smartphone className="text-fg-subtle mx-auto size-10" aria-hidden />
        <h1 className="text-fg mt-4 text-lg font-semibold">Ferramenta disponível no celular</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Abra esta página pelo menu do aplicativo no celular para usar a câmera e exibir o código de barras.
        </p>
      </div>
    </div>
  );
}
