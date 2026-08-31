import { Button } from "@/components/ui/button";
import { setSupplierStatus } from "@/features/suppliers/actions";

/**
 * Desativar/reativar o fornecedor.
 *
 * Vive num componente próprio porque o mesmo botão aparece no cabeçalho da
 * página inteira e no do modal — que moram em arquivos diferentes, já que a
 * casca do modal é um `layout.tsx`.
 */
export function SupplierStatusToggle({
  supplierId,
  status,
}: {
  supplierId: string;
  status: string;
}) {
  return (
    <form
      action={setSupplierStatus.bind(
        null,
        supplierId,
        status === "active" ? "inactive" : "active",
      )}
    >
      <Button type="submit" size="sm" variant="ghost">
        {status === "active" ? "Desativar" : "Reativar"}
      </Button>
    </form>
  );
}
