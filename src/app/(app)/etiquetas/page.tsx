import { Smartphone } from "lucide-react";
import { redirect } from "next/navigation";

import { MobileBarcodeDisplay } from "@/components/products/mobile-barcode-display";
import { listShoppingProducts } from "@/features/shopping-list/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function EtiquetasPage() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("product.view")) redirect("/dashboard");

  const products = await listShoppingProducts(company.companyId);

  return (
    <div
      data-mobile-scroll="contained"
      className="flex min-h-0 w-full flex-1 flex-col"
    >
      {/* No celular a página não rola: o código fica no topo e só a lista de
          baixo rola. O título já está na barra do alto. */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <MobileBarcodeDisplay
          companyId={company.companyId}
          products={products}
        />
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
