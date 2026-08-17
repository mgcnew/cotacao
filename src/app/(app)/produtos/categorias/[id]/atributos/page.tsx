import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AttributeForm } from "@/components/products/attribute-form";
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
import { setAttributeDefinitionActive } from "@/features/products/actions";
import { ATTRIBUTE_DATA_TYPE_LABEL } from "@/features/products/attributes";
import {
  getCategory,
  listAttributeDefinitions,
  listUnits,
} from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function AtributosPage({
  params,
}: PageProps<"/produtos/categorias/[id]/atributos">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [category, attributes, units, permissions] = await Promise.all([
    getCategory(company.companyId, id),
    listAttributeDefinitions(company.companyId, id),
    listUnits(company.companyId),
    getPermissions(company.companyId),
  ]);

  // A RLS já esconderia categoria de outra empresa; sem linha, não existe aqui.
  if (!category) notFound();

  const podeEditar = permissions.has("product.update");
  const unidadesAtivas = units
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, label: `${u.name} (${u.symbol})` }));

  return (
    <div className="w-full">
      <PageHeader
        title={`Atributos de ${category.name}`}
        description="Campos que só fazem sentido nesta categoria. São eles que permitem comparar propostas com apresentações diferentes."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos/categorias">Voltar</Link>
          </Button>
        }
      />

      <div className="border-border bg-surface-sunken mb-6 rounded-xl border p-4">
        <p className="text-fg-muted text-sm">
          Exemplo do documento mestre: dois fornecedores cotam sacola a R$ 49,00,
          um em pacote com 400 e outro com 500. Com o atributo{" "}
          <span className="text-fg font-medium">quantidade por pacote</span>, o
          sistema mostra R$ 0,1225 contra R$ 0,0980 por unidade — sem ele, as
          duas propostas parecem idênticas.
        </p>
      </div>

      {podeEditar ? (
        <div className="mb-6">
          <AttributeForm categoryId={id} units={unidadesAtivas} />
        </div>
      ) : null}

      {attributes.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Nenhum atributo nesta categoria"
          description={
            podeEditar
              ? "Categorias simples não precisam de atributo algum. Adicione só o que a comparação exigir."
              : "Seu papel não permite configurar atributos."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atributo</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Preenchimento</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {attributes.map((attr) => (
              <TableRow key={attr.id}>
                <TableCell className="font-medium">{attr.name}</TableCell>
                <TableCell className="text-fg-subtle font-mono text-xs">
                  {attr.key}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {ATTRIBUTE_DATA_TYPE_LABEL[attr.dataType] ?? attr.dataType}
                </TableCell>
                <TableCell className="text-fg-muted font-mono text-xs">
                  {attr.unitSymbol ?? "—"}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {attr.isRequired ? "Obrigatório" : "Opcional"}
                  {attr.isConversionFactor ? (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      converte
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={attr.isActive ? "default" : "secondary"}>
                    {attr.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                {podeEditar ? (
                  <TableCell>
                    <form
                      action={setAttributeDefinitionActive.bind(
                        null,
                        attr.id,
                        id,
                        !attr.isActive,
                      )}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-fg-muted whitespace-nowrap"
                      >
                        {attr.isActive ? "Desativar" : "Reativar"}
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
        Atributo desativado some do cadastro de novos produtos, mas os valores já
        gravados continuam no histórico.
      </p>
    </div>
  );
}
