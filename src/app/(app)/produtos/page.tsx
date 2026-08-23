import { Package, Search } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
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
import { normalizeListSearch, parseListPagination } from "@/lib/list-pagination";

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
  const statusBruto = Array.isArray(parametros.status)
    ? parametros.status[0]
    : parametros.status;
  const status = ["ativos", "inativos"].includes(statusBruto ?? "")
    ? statusBruto
    : "todos";

  const filtrados = products.filter((product) => {
    if (
      busca &&
      !normalizeListSearch(product.name).includes(normalizeListSearch(busca))
    ) {
      return false;
    }
    if (status === "ativos" && !product.is_active) return false;
    if (status === "inativos" && product.is_active) return false;
    return true;
  });
  const pagination = parseListPagination(parametros, filtrados.length);
  const visiveis = filtrados.slice(pagination.start, pagination.end);
  const temFiltro = Boolean(busca) || status !== "todos";

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");

  return (
    <div className="w-full">
      <PageHeader
        title="Produtos"
        description="Catálogo único: revenda e uso interno, separados pela finalidade."
        action={
          podeCriar ? (
            <Button asChild size="sm">
              <Link href="/produtos/novo">Novo produto</Link>
            </Button>
          ) : null
        }
      />

      {products.length > 0 ? (
        <form className="border-border bg-surface mb-4 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="text-fg-subtle pointer-events-none absolute top-2 left-2.5 size-4" aria-hidden />
            <Input name="busca" defaultValue={busca} placeholder="Buscar produto pelo nome" className="pl-8" />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="border-input bg-background text-fg h-8 rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            aria-label="Filtrar produtos por situação"
          >
            <option value="todos">Todas as situações</option>
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
          </select>
          <input type="hidden" name="por_pagina" value={pagination.pageSize} />
          <Button type="submit" size="sm" variant="outline">Filtrar</Button>
          {temFiltro ? <Button asChild size="sm" variant="ghost"><Link href="/produtos">Limpar</Link></Button> : null}
        </form>
      ) : null}

      {filtrados.length === 0 && temFiltro ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto neste filtro"
          description="Ajuste a busca ou a situação para encontrar outros itens do catálogo."
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
          description="Cadastre o primeiro produto com a unidade de compra, a de precificação e a de comparação. Se a categoria ou a unidade que você precisa ainda não existir, dá para criá-la ali mesmo."
          action={
            podeCriar ? (
              <Button asChild size="sm">
                <Link href="/produtos/novo">Cadastrar produto</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
              {/* Sete colunas não cabem num celular: a tabela rolaria de lado
                  e levaria o botão de ação para fora da tela. O que some da
                  linha reaparece embaixo do nome do produto. */}
              <TableHead>Produto</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">Finalidade</TableHead>
              <TableHead className="hidden sm:table-cell">Compra</TableHead>
              <TableHead className="hidden lg:table-cell">
                Precificação
              </TableHead>
              <TableHead className="hidden lg:table-cell">Comparação</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">
                  {product.name}
                  <span className="text-fg-muted block max-w-40 text-xs font-normal whitespace-normal md:hidden">
                    {product.categories?.name} ·{" "}
                    <span className="font-mono">
                      {product.purchase_unit?.code}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-fg-muted hidden md:table-cell">
                  {product.categories?.name}
                </TableCell>
                <TableCell className="text-fg-muted hidden lg:table-cell">
                  {PRODUCT_PURPOSE_LABEL[product.purpose] ?? product.purpose}
                </TableCell>
                <TableCell className="text-fg-muted hidden font-mono text-xs sm:table-cell">
                  {product.purchase_unit?.code}
                </TableCell>
                <TableCell className="text-fg-muted hidden font-mono text-xs lg:table-cell">
                  {product.pricing_unit?.code}
                </TableCell>
                <TableCell className="text-fg-muted hidden font-mono text-xs lg:table-cell">
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
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={filtrados.length}
        />
        </div>
      )}

      {/* Categorias e unidades saíram do cabeçalho: são manutenção de catálogo,
          não o que se vem fazer aqui todo dia — e o cadastro de produto já cria
          a que faltar. Continuam alcançáveis porque é por Categorias que se
          chega aos atributos, que não cabem no fluxo do produto. */}
      <p className="text-fg-subtle border-border mt-8 border-t pt-4 text-xs">
        Manutenção do catálogo:{" "}
        <Link
          href="/produtos/categorias"
          className="hover:text-fg underline-offset-4 hover:underline"
        >
          categorias
        </Link>{" "}
        ({counts.categories}) ·{" "}
        <Link
          href="/produtos/unidades"
          className="hover:text-fg underline-offset-4 hover:underline"
        >
          unidades
        </Link>{" "}
        ({counts.units})
      </p>
    </div>
  );
}
