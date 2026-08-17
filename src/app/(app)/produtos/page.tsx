import { Package } from "lucide-react";
import Link from "next/link";


import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
import { setProductActive } from "@/features/products/actions";
import { getCatalogCounts, listProducts } from "@/features/products/queries";
import { PRODUCT_PURPOSE_LABEL } from "@/features/products/purposes";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * Compara nomes ignorando acento e caixa.
 *
 * A busca global chega aqui por `?busca=`, e ela é acento-insensível no banco
 * (0031). Filtrar com `includes` cru desfaria isso: quem clicasse em "Linguiça"
 * na sugestão cairia numa lista vazia.
 */
function normaliza(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export default async function ProdutosPage({
  searchParams,
}: PageProps<"/produtos">) {
  const company = await requireActiveCompany();
  const [products, counts, permissions] = await Promise.all([
    listProducts(company.companyId),
    getCatalogCounts(company.companyId),
    getPermissions(company.companyId),
  ]);

  const parametros = await searchParams;
  const bruto = Array.isArray(parametros.busca)
    ? parametros.busca[0]
    : parametros.busca;
  const busca = (bruto ?? "").trim();

  const visiveis = busca
    ? products.filter((p) => normaliza(p.name).includes(normaliza(busca)))
    : products;

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Produtos"
        description={`Catálogo único: revenda e uso interno. ${counts.categories} categorias, ${counts.units} unidades cadastradas.`}
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/produtos/categorias">Categorias</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/produtos/unidades">Unidades</Link>
            </Button>
            {podeCriar ? (
              <Button asChild size="sm">
                <Link href="/produtos/novo">Novo produto</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {busca ? (
        <p className="border-border bg-surface-sunken text-fg-muted mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm">
          <span>
            Mostrando {visiveis.length}{" "}
            {visiveis.length === 1 ? "produto" : "produtos"} para “{busca}”.
          </span>
          <Link href="/produtos" className="text-primary text-xs">
            Ver o catálogo inteiro
          </Link>
        </p>
      ) : null}

      {visiveis.length === 0 && busca ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto com esse nome"
          description={`Nada no catálogo casa com “${busca}”.`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/produtos">Ver o catálogo inteiro</Link>
            </Button>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Catálogo vazio"
          description={
            counts.categories === 0
              ? "Comece pelas categorias: todo produto pertence a uma, então elas vêm antes."
              : "Cadastre o primeiro produto com a unidade de compra, a de precificação e a de comparação."
          }
          action={
            podeCriar ? (
              <Button asChild size="sm">
                <Link
                  href={
                    counts.categories === 0
                      ? "/produtos/categorias"
                      : "/produtos/novo"
                  }
                >
                  {counts.categories === 0
                    ? "Criar categoria"
                    : "Cadastrar produto"}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Finalidade</TableHead>
              <TableHead>Compra</TableHead>
              <TableHead>Precificação</TableHead>
              <TableHead>Comparação</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-fg-muted">
                  {product.categories?.name}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {PRODUCT_PURPOSE_LABEL[product.purpose] ?? product.purpose}
                </TableCell>
                <TableCell className="text-fg-muted font-mono text-xs">
                  {product.purchase_unit?.code}
                </TableCell>
                <TableCell className="text-fg-muted font-mono text-xs">
                  {product.pricing_unit?.code}
                </TableCell>
                <TableCell className="text-fg-muted font-mono text-xs">
                  {/* Sem unidade própria, quem compara é a de precificação. */}
                  {product.comparison_unit?.code ?? product.pricing_unit?.code}
                </TableCell>
                <TableCell>
                  <Badge variant={product.is_active ? "default" : "secondary"}>
                    {product.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                {podeEditar ? (
                  <TableCell>
                    <form
                      action={setProductActive.bind(
                        null,
                        product.id,
                        !product.is_active,
                      )}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-fg-muted whitespace-nowrap"
                      >
                        {product.is_active ? "Desativar" : "Reativar"}
                      </Button>
                    </form>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
