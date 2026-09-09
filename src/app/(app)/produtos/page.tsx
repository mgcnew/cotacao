import { MoreHorizontal, Package, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
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

export default function ProdutosPage({ searchParams }: PageProps<"/produtos">) {
  return (
    <div className="w-full sm:flex sm:min-h-0 sm:flex-1 sm:flex-col">
      <PageHeader
        title="Produtos"
        description="Catálogo único: revenda e uso interno, separados pela finalidade."
        action={
          <Suspense fallback={null}>
            <ProductCatalogActions />
          </Suspense>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
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
          <Link href="/produtos/novo">Novo produto</Link>
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
        <div className="mb-4 flex shrink-0 items-center">
          <FilterDialog basePath="/produtos" ativos={filtrosAtivos}>
            <ProductFilterFields
              busca={filters.busca}
              status={filters.status ?? "todos"}
              categoria={filters.categoriaId}
              categories={catalog.categories}
              pageSize={catalog.pageSize}
            />
          </FilterDialog>
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
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:table-row sm:p-0"
                  >
                    {/* `whitespace-normal` também na tabela: nome comprido que
                        não quebra é o que empurrava a coluna de ações para
                        fora da tela em telas médias. */}
                    <TableCell className="col-span-2 block p-0 font-medium whitespace-normal sm:table-cell sm:p-2">
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
                    <TableCell className="block p-0 sm:table-cell sm:p-2">
                      <Badge
                        variant={product.isActive ? "default" : "secondary"}
                      >
                        {product.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {podeEditar || podeExcluir ? (
                      <TableCell className="block justify-self-end p-0 sm:table-cell sm:p-2">
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && product.unitsEditable ? (
                            <Tooltip content="Editar unidades" side="top">
                              <Button asChild size="icon-sm" variant="ghost">
                                <Link href={`/produtos/editar/${product.id}`}>
                                  <Pencil aria-hidden />
                                  <span className="sr-only">
                                    Editar unidades de {product.name}
                                  </span>
                                </Link>
                              </Button>
                            </Tooltip>
                          ) : null}
                          {podeEditar ? (
                            <form
                              action={setProductActive.bind(
                                null,
                                product.id,
                                !product.isActive,
                              )}
                            >
                              <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                className="text-fg-muted whitespace-nowrap"
                              >
                                {product.isActive ? "Desativar" : "Reativar"}
                              </Button>
                            </form>
                          ) : null}
                          {/* O veredito de exclusão cruza sete tabelas e não é
                              calculado por linha: quem clica abre a
                              confirmação, e é lá que o produto revela se pode
                              sair, se basta desfazer um vínculo ou se só
                              resta inativar. */}
                          {podeExcluir ? (
                            <Tooltip content="Excluir produto" side="top">
                              <Button asChild size="icon-sm" variant="ghost">
                                <Link href={`/produtos/excluir/${product.id}`}>
                                  <Trash2 aria-hidden />
                                  <span className="sr-only">
                                    Excluir {product.name}
                                  </span>
                                </Link>
                              </Button>
                            </Tooltip>
                          ) : null}
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
