import { FolderTree } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryForm } from "@/components/products/category-form";
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
import { setCategoryActive } from "@/features/products/actions";
import { listCategories } from "@/features/products/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function CategoriasPage() {
  const company = await requireActiveCompany();
  const [categories, permissions] = await Promise.all([
    listCategories(company.companyId),
    getPermissions(company.companyId),
  ]);

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Categorias"
        description="Classificação estrutural do produto. Não confundir com os grupos da rodada, que são organização da cotação."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/produtos">Voltar aos produtos</Link>
          </Button>
        }
      />

      {podeCriar ? (
        <div className="mb-6">
          <CategoryForm />
        </div>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Nenhuma categoria ainda"
          description={
            podeCriar
              ? "Crie as primeiras acima. Todo produto precisa de uma categoria, então este é o passo anterior ao catálogo."
              : "Seu papel não permite criar categorias. Peça a um administrador."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Produtos</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-fg-muted">
                  {category.description ?? "—"}
                </TableCell>
                <TableCell className="text-fg-muted text-right tabular-nums">
                  {category.productCount}
                </TableCell>
                <TableCell>
                  <Badge variant={category.isActive ? "default" : "secondary"}>
                    {category.isActive ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                {podeEditar ? (
                  <TableCell className="flex items-center gap-1">
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="text-fg-muted whitespace-nowrap"
                    >
                      <Link href={`/produtos/categorias/${category.id}/atributos`}>
                        Atributos
                      </Link>
                    </Button>
                    <form
                      action={setCategoryActive.bind(
                        null,
                        category.id,
                        !category.isActive,
                      )}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-fg-muted whitespace-nowrap"
                      >
                        {category.isActive ? "Desativar" : "Reativar"}
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
        Categorias não são excluídas: produtos e cotações antigas continuam
        apontando para elas. Desativar tira a categoria das listas de escolha
        sem apagar o histórico.
      </p>
    </div>
  );
}
