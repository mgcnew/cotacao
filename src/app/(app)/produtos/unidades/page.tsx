import { Ruler } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UnitForm } from "@/components/products/unit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setUnitActive } from "@/features/products/actions";
import { listUnits } from "@/features/products/queries";
import { UNIT_KIND_LABEL } from "@/features/products/units";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function UnidadesPage() {
  const company = await requireActiveCompany();
  const [units, permissions] = await Promise.all([
    listUnits(company.companyId),
    getPermissions(company.companyId),
  ]);

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");

  return (
    <div className="w-full">
      <PageHeader
        title="Unidades"
        description="Cada produto usa três: em que se compra, em que o fornecedor cota o preço e em que os preços são comparados entre fornecedores."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />

      {podeCriar ? (
        <div className="mb-6">
          <UnitForm />
        </div>
      ) : null}

      {units.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhuma unidade"
          description="As unidades padrão são criadas junto com a empresa. Se a lista está vazia, algo saiu do lugar no provisionamento."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Símbolo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-mono text-xs font-medium">
                  {unit.code}
                </TableCell>
                <TableCell>{unit.name}</TableCell>
                <TableCell className="text-fg-muted font-mono text-xs">
                  {unit.symbol}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {UNIT_KIND_LABEL[unit.kind] ?? unit.kind}
                </TableCell>
                <TableCell>
                  <Badge variant={unit.is_active ? "default" : "secondary"}>
                    {unit.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                {podeEditar ? (
                  <TableCell>
                    <form
                      action={setUnitActive.bind(null, unit.id, !unit.is_active)}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-fg-muted whitespace-nowrap"
                      >
                        {unit.is_active ? "Desativar" : "Reativar"}
                      </Button>
                    </form>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-fg-subtle mt-4 text-xs">
        Desativar não apaga: produtos já cadastrados continuam usando a unidade,
        ela apenas deixa de aparecer nas listas de escolha.
      </p>
    </div>
  );
}
