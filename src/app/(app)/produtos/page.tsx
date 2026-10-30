import { MoreHorizontal, Package, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { ProductRowActions } from "@/components/products/product-row-actions";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { FilterChips, ListSearch } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  DropdownMenu,
  DropdownMenuBadge,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  countProductListFilters,
  parseProductListFilters,
} from "@/features/products/filters";
import {
  getCatalogCounts,
  listProductsPage,
} from "@/features/products/queries";
import { PRODUCT_PURPOSE_LABEL } from "@/features/products/purposes";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { parseListPagination } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

function ProductFilterFields({
  status,
  categoria,
  categories,
  pageSize,
}: {
  status: string;
  categoria: string | null;
  categories: { id: string; name: string }[];
  pageSize: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="por_pagina" value={pageSize} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-status" className="text-fg-muted text-xs">
          Situação
        </label>
        {/* "Todas" é o vazio: aparece como rótulo do gatilho e como primeira
            opção, e sai da URL em vez de virar `?status=`. */}
        <ThemedSelect
          id="product-status"
          name="status"
          defaultValue={status === "todos" ? "" : status}
          placeholder="Todas"
          emptyOptionLabel="Todas"
          options={[
            { value: "ativos", label: "Somente ativos" },
            { value: "inativos", label: "Somente inativos" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-category" className="text-fg-muted text-xs">
          Categoria
        </label>
        <ThemedSelect
          id="product-category"
          name="categoria"
          defaultValue={categoria ?? ""}
          placeholder="Todas"
          emptyOptionLabel="Todas"
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
        />
      </div>
    </div>
  );
}

export default async function ProdutosPage({
  searchParams,
}: PageProps<"/produtos">) {
  // Só o recorte (busca, filtros, página), sem tocar no banco: serve de `key`
  // para a fronteira abaixo.
  const recorte = await searchParams;

  return (
    <div className="w-full sm:flex sm:min-h-0 sm:flex-1 sm:flex-col">
      <PageHeader
        title="Produtos"
        info="Catálogo único: revenda e uso interno, separados pela finalidade."
        action={
          <>
            <Suspense fallback={null}>
              {/* No celular a busca divide a linha com as ações em vez de
                  tomá-la inteira: eram três linhas antes do primeiro produto. */}
              <ListSearch
                placeholder="Buscar produto"
                className="w-auto min-w-0 flex-1 sm:w-72 sm:flex-none"
              />
            </Suspense>
            <Suspense fallback={null}>
              <ProductCatalogActions />
            </Suspense>
          </>
        }
      />

      {/* A `key` amarra a fronteira ao recorte: filtrar ou paginar traz o
          esqueleto de volta, em vez de manter a lista anterior parada na tela
          até a nova chegar. */}
      <Suspense
        key={JSON.stringify(recorte)}
        fallback={<TableSkeleton rows={8} columns={7} />}
      >
        <ProdutosContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Uma ação primária e um `⋯` com o resto.
 *
 * "Novo produto" é a razão de existir desta tela: dentro do menu custaria dois
 * cliques na ação mais frequente e o olho perderia onde pousar. As outras são
 * ocasionais — importar, corrigir, manter categorias e unidades — e três
 * botões de contorno na mesma linha competiam com ela sem precisar.
 *
 * A permissão é lida item a item, e não no menu inteiro: quem só consulta
 * continua chegando a categorias e unidades, que são navegação, não edição.
 */
async function ProductCatalogActions() {
  const company = await requireActiveCompany();
  const [permissions, counts] = await Promise.all([
    getPermissions(company.companyId),
    getCatalogCounts(company.companyId),
  ]);
  const canCreate = permissions.has("product.create");
  const canUpdate = permissions.has("product.update");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Mais ações do catálogo"
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Catálogo</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/produtos/categorias">
                Categorias
                <DropdownMenuBadge>{counts.categories}</DropdownMenuBadge>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/produtos/unidades">
                Unidades
                <DropdownMenuBadge>{counts.units}</DropdownMenuBadge>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {canCreate || canUpdate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Ferramentas</DropdownMenuLabel>
                {canCreate ? (
                  <DropdownMenuItem asChild>
                    <Link href="/produtos/importacoes">Importar planilha</Link>
                  </DropdownMenuItem>
                ) : null}
                {canUpdate ? (
                  <DropdownMenuItem asChild>
                    <Link href="/produtos/correcao-unidades">
                      Corrigir unidades
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canCreate ? (
        <Button asChild size="sm">
          <Link href="/produtos/novo">
            <Plus className="sm:hidden" aria-hidden />
            <span className="max-sm:sr-only">Novo produto</span>
          </Link>
        </Button>
      ) : null}
    </>
  );
}

async function ProdutosContent({
  searchParams,
}: {
  searchParams: PageProps<"/produtos">["searchParams"];
}) {
  const [company, parametros] = await Promise.all([
    requireActiveCompany(),
    searchParams,
  ]);
  const filters = parseProductListFilters(parametros);
  const requestedPagination = parseListPagination(
    parametros,
    Number.MAX_SAFE_INTEGER,
  );
  const [catalog, permissions] = await Promise.all([
    listProductsPage(company.companyId, filters, {
      page: requestedPagination.page,
      pageSize: requestedPagination.pageSize,
    }),
    getPermissions(company.companyId),
  ]);
  const filtrosAtivos = countProductListFilters(filters);
  const temFiltro = filtrosAtivos > 0;

  const podeCriar = permissions.has("product.create");
  const podeEditar = permissions.has("product.update");
  const podeExcluir = permissions.has("product.delete");

  return (
    <>
      {catalog.catalogTotal > 0 ? (
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <FilterDialog
            basePath="/produtos"
            ativos={filtrosAtivos - Number(Boolean(filters.busca))}
          >
            <ProductFilterFields
              status={filters.status ?? "todos"}
              categoria={filters.categoriaId}
              categories={catalog.categories}
              pageSize={catalog.pageSize}
            />
          </FilterDialog>
          <FilterChips
            className="contents"
            filtros={[
              ...(filters.status
                ? [
                    {
                      rotulo:
                        filters.status === "ativos"
                          ? "Somente ativos"
                          : "Somente inativos",
                      chaves: ["status"],
                    },
                  ]
                : []),
              ...(filters.categoriaId
                ? [
                    {
                      rotulo: `Categoria: ${
                        catalog.categories.find(
                          (c) => c.id === filters.categoriaId,
                        )?.name ?? "—"
                      }`,
                      chaves: ["categoria"],
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ) : null}

      {catalog.total === 0 && temFiltro ? (
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
      ) : catalog.catalogTotal === 0 ? (
        <EmptyState
          icon={Package}
          title="Catálogo vazio"
          description="Cadastre o primeiro produto com a unidade de compra, a de precificação e a de comparação. Se a categoria ou a unidade que você precisa ainda não existir, dá para criá-la ali mesmo."
          action={
            podeCriar ? (
              // A importação também aparece aqui, e não só no `⋯`: numa conta
              // recém-criada ela é o caminho mais provável, e escondida no
              // menu sumiria justo de quem mais precisa dela.
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/produtos/novo">Cadastrar produto</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/produtos/importacoes">Importar planilha</Link>
                </Button>
              </div>
            ) : null
          }
        />
      ) : (
        <>
          <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-xs sm:min-h-0 sm:flex-1">
            {/* Sete colunas não cabem num celular: a tabela rolaria de lado e
                levaria o botão de ação para fora da tela. Abaixo de `sm` a
                linha vira ficha empilhada — o nome ocupa a largura toda e o
                que sumiu das colunas reaparece embaixo dele; a partir de `sm`
                é tabela de novo, ganhando uma coluna a cada respiro. */}
            <Table
              className="block sm:table"
              containerClassName="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain"
              containerProps={{
                key: catalog.page,
                role: "region",
                "aria-label": "Catálogo de produtos",
                tabIndex: 0,
              }}
            >
              {/* Preso ao topo porque agora são as linhas que rolam: sem isto
                  os rótulos das colunas somem logo na primeira rolagem. */}
              <TableHeader className="hidden sm:table-header-group [&_th]:bg-surface-sunken [&_th]:sticky [&_th]:top-0 [&_th]:z-10">
                <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                  <TableHead>Produto</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Categoria
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Finalidade
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">Compra</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Precificação
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Comparação
                  </TableHead>
                  <TableHead>Situação</TableHead>
                  {podeEditar || podeExcluir ? (
                    <TableHead className="w-0" />
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody className="block sm:table-row-group">
                {catalog.rows.map((product) => (
                  <TableRow
                    key={product.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:table-row sm:p-0"
                  >
                    {/* `whitespace-normal` também na tabela: nome comprido que
                        não quebra é o que empurrava a coluna de ações para
                        fora da tela em telas médias. */}
                    <TableCell className="col-start-1 block p-0 font-medium whitespace-normal sm:table-cell sm:p-2">
                      <Link
                        href={`/produtos/historico/${product.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="text-fg-muted block text-xs font-normal whitespace-normal md:hidden">
                        {product.categoryName}
                        <span className="sm:hidden">
                          {" · "}
                          <span className="font-mono">
                            {product.purchaseUnitCode}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-fg-muted hidden md:table-cell">
                      {product.categoryName}
                    </TableCell>
                    <TableCell className="text-fg-muted hidden lg:table-cell">
                      {PRODUCT_PURPOSE_LABEL[product.purpose] ??
                        product.purpose}
                    </TableCell>
                    <TableCell className="text-fg-muted hidden font-mono text-xs sm:table-cell">
                      {product.purchaseUnitCode}
                    </TableCell>
                    <TableCell className="text-fg-muted hidden font-mono text-xs lg:table-cell">
                      {product.pricingUnitCode}
                    </TableCell>
                    <TableCell className="text-fg-muted hidden font-mono text-xs lg:table-cell">
                      {/* Sem unidade própria, quem compara é a de precificação. */}
                      {product.comparisonUnitCode ?? product.pricingUnitCode}
                    </TableCell>
                    {/* No celular o "Ativo" some: quase todo o catálogo é ativo
                        e o selo custava uma linha por produto. Só o inativo,
                        que é a exceção, aparece. */}
                    <TableCell
                      className={cn(
                        "col-start-1 block p-0 sm:table-cell sm:p-2",
                        product.isActive && "max-sm:hidden",
                      )}
                    >
                      <Badge
                        variant={product.isActive ? "default" : "secondary"}
                      >
                        {product.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {podeEditar || podeExcluir ? (
                      <TableCell className="col-start-2 row-span-2 row-start-1 block self-center justify-self-end p-0 sm:table-cell sm:p-2">
                        <div className="flex items-center justify-end">
                          <ProductRowActions
                            productId={product.id}
                            productName={product.name}
                            isActive={product.isActive}
                            podeEditar={podeEditar}
                            podeExcluir={podeExcluir}
                          />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DataTablePagination
              page={catalog.page}
              pageSize={catalog.pageSize}
              total={catalog.total}
            />
          </div>
        </>
      )}
    </>
  );
}
