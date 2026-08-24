import { Package } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/page-skeleton";
import { AdaptivePageSize } from "@/components/ui/adaptive-page-size";
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

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function ProductFilterFields({
  busca,
  status,
  categoria,
  categories,
  pageSize,
}: {
  busca: string;
  status: string;
  categoria: string | null;
  categories: { id: string; name: string }[];
  pageSize: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="product-search" className="text-fg-muted text-xs">
          Nome do produto
        </label>
        <Input
          id="product-search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar produto"
          className="h-8"
        />
      </div>
      <input type="hidden" name="por_pagina" value={pageSize} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-status" className="text-fg-muted text-xs">
          Situação
        </label>
        <select
          id="product-status"
          name="status"
          defaultValue={status === "todos" ? "" : status}
          className={selectClass}
        >
          <option value="">Todas</option>
          <option value="ativos">Somente ativos</option>
          <option value="inativos">Somente inativos</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-category" className="text-fg-muted text-xs">
          Categoria
        </label>
        <select
          id="product-category"
          name="categoria"
          defaultValue={categoria ?? ""}
          className={selectClass}
        >
          <option value="">Todas</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function ProdutosPage({
  searchParams,
}: PageProps<"/produtos">) {
  return (
    <div className="w-full">
      <PageHeader
        title="Produtos"
        description="Catálogo único: revenda e uso interno, separados pela finalidade."
        action={
          <Suspense fallback={null}>
            <NovoProdutoAction />
          </Suspense>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
        <ProdutosContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NovoProdutoAction() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  return permissions.has("product.create") ? (
    <Button asChild size="sm">
      <Link href="/produtos/novo">Novo produto</Link>
    </Button>
  ) : null;
}

async function ProdutosContent({
  searchParams,
}: {
  searchParams: PageProps<"/produtos">["searchParams"];
}) {
  const company = await requireActiveCompany();
  const [products, permissions, parametros] = await Promise.all([
    listProducts(company.companyId),
    getPermissions(company.companyId),
    searchParams,
  ]);

  const bruto = Array.isArray(parametros.busca)
    ? parametros.busca[0]
    : parametros.busca;
  const busca = (bruto ?? "").trim();
  const statusBruto = Array.isArray(parametros.status)
    ? parametros.status[0]
    : parametros.status;
  const status = ["ativos", "inativos"].includes(statusBruto ?? "")
    ? (statusBruto ?? "todos")
    : "todos";
  const categoryMap = new Map<string, string>();
  for (const product of products) {
    categoryMap.set(
      product.category_id,
      product.categories?.name ?? "Categoria sem nome",
    );
  }
  const categories = [...categoryMap]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const categoriaBruta = Array.isArray(parametros.categoria)
    ? parametros.categoria[0]
    : parametros.categoria;
  const categoria = categories.some((item) => item.id === categoriaBruta)
    ? (categoriaBruta ?? null)
    : null;

  const filtrados = products.filter((product) => {
    if (
      busca &&
      !normalizeListSearch(product.name).includes(normalizeListSearch(busca))
    ) {
      return false;
    }
    if (status === "ativos" && !product.is_active) return false;
    if (status === "inativos" && product.is_active) return false;
    if (categoria && product.category_id !== categoria) return false;
    return true;
  });
  const pagination = parseListPagination(parametros, filtrados.length, {
    pageSizeRange: { min: 6, max: 15, default: 10 },
  });
  const visiveis = filtrados.slice(pagination.start, pagination.end);
  const filtrosAtivos =
    Number(Boolean(busca)) +
    Number(status !== "todos") +
    Number(Boolean(categoria));
  const temFiltro = filtrosAtivos > 0;

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");

  return (
    <>
      {products.length > 0 ? (
        <div className="mb-4 flex items-center">
          <FilterDialog basePath="/produtos" ativos={filtrosAtivos}>
            <ProductFilterFields
              busca={busca}
              status={status}
              categoria={categoria}
              categories={categories}
              pageSize={pagination.pageSize}
            />
          </FilterDialog>
        </div>
      ) : null}

      {filtrados.length === 0 && temFiltro ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto neste filtro"
          description="Ajuste a busca, a situação ou a categoria para encontrar outros itens do catálogo."
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
        <>
          <AdaptivePageSize current={pagination.pageSize} />
          <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs sm:min-h-[calc(100dvh-14rem)]">
            <Table
              containerClassName="min-h-0 flex-1"
              className={
                visiveis.length === pagination.pageSize ? "h-full" : undefined
              }
            >
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
              allowPageSize={false}
            />
          </div>
        </>
      )}

      {/* Categorias e unidades saíram do cabeçalho: são manutenção de catálogo,
          não o que se vem fazer aqui todo dia — e o cadastro de produto já cria
          a que faltar. Continuam alcançáveis porque é por Categorias que se
          chega aos atributos, que não cabem no fluxo do produto. */}
      <Suspense fallback={<CatalogMaintenance />}>
        <CatalogMaintenanceWithCounts companyId={company.companyId} />
      </Suspense>
    </>
  );
}

function CatalogMaintenance({
  categories,
  units,
}: {
  categories?: number;
  units?: number;
}) {
  return (
    <p className="text-fg-subtle border-border mt-8 border-t pt-4 text-xs">
      Manutenção do catálogo:{" "}
      <Link
        href="/produtos/categorias"
        className="hover:text-fg underline-offset-4 hover:underline"
      >
        categorias
      </Link>{" "}
      {categories === undefined ? null : <>({categories})</>} ·{" "}
      <Link
        href="/produtos/unidades"
        className="hover:text-fg underline-offset-4 hover:underline"
      >
        unidades
      </Link>{" "}
      {units === undefined ? null : <>({units})</>}
    </p>
  );
}

async function CatalogMaintenanceWithCounts({
  companyId,
}: {
  companyId: string;
}) {
  const counts = await getCatalogCounts(companyId);
  return (
    <CatalogMaintenance
      categories={counts.categories}
      units={counts.units}
    />
  );
}
