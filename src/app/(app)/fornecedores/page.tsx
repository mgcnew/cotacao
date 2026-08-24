import { Truck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { FilterDialog } from "@/components/layout/filter-dialog";
import { IntentPrefetchLink } from "@/components/layout/intent-prefetch-link";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/page-skeleton";
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
import { formatCnpj } from "@/features/company/cnpj";
import { listSuppliers } from "@/features/suppliers/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { normalizeListSearch, parseListPagination } from "@/lib/list-pagination";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function SupplierFilterFields({
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
        <label htmlFor="supplier-search" className="text-fg-muted text-xs">
          Nome, CNPJ ou contato
        </label>
        <Input
          id="supplier-search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar fornecedor"
          className="h-8"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-status" className="text-fg-muted text-xs">
          Situação
        </label>
        <select
          id="supplier-status"
          name="status"
          defaultValue={status === "todos" ? "" : status}
          className={selectClass}
        >
          <option value="">Todas</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="blocked">Bloqueados</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplier-category" className="text-fg-muted text-xs">
          Categoria atendida
        </label>
        <select
          id="supplier-category"
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
      <input type="hidden" name="por_pagina" value={pageSize} />
    </div>
  );
}

export default function FornecedoresPage({
  searchParams,
}: PageProps<"/fornecedores">) {
  return (
    <div className="w-full">
      <PageHeader
        title="Fornecedores"
        description="Cadastro, contatos e situação da rede de fornecimento."
        action={
          <Suspense fallback={null}>
            <NovoFornecedorAction />
          </Suspense>
        }
      />

      <Suspense fallback={<TableSkeleton rows={6} columns={4} />}>
        <FornecedoresContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NovoFornecedorAction() {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);

  return permissions.has("supplier.create") ? (
    <Button asChild size="sm">
      <Link href="/fornecedores/novo">Novo fornecedor</Link>
    </Button>
  ) : null;
}

async function FornecedoresContent({
  searchParams,
}: {
  searchParams: PageProps<"/fornecedores">["searchParams"];
}) {
  const company = await requireActiveCompany();
  const [suppliers, permissions, params] = await Promise.all([
    listSuppliers(company.companyId),
    getPermissions(company.companyId),
    searchParams,
  ]);

  const podeCriar = permissions.has("supplier.create");
  const buscaBruta = Array.isArray(params.busca)
    ? params.busca[0]
    : params.busca;
  const busca = (buscaBruta ?? "").trim();
  const statusBruto = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const status = ["active", "inactive", "blocked"].includes(statusBruto ?? "")
    ? (statusBruto ?? "todos")
    : "todos";
  const categoryMap = new Map<string, string>();
  for (const supplier of suppliers) {
    for (const link of supplier.supplier_categories ?? []) {
      categoryMap.set(
        link.category_id,
        link.categories?.name ?? "Categoria sem nome",
      );
    }
  }
  const categories = [...categoryMap]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const categoriaBruta = Array.isArray(params.categoria)
    ? params.categoria[0]
    : params.categoria;
  const categoria = categories.some((item) => item.id === categoriaBruta)
    ? (categoriaBruta ?? null)
    : null;
  const needle = normalizeListSearch(busca);
  const filtrados = suppliers.filter((supplier) => {
    if (status !== "todos" && supplier.status !== status) return false;
    if (
      categoria &&
      !supplier.supplier_categories?.some(
        (link) => link.category_id === categoria,
      )
    ) {
      return false;
    }
    if (!needle) return true;
    const contacts = supplier.supplier_contacts
      ?.map(
        (contact) =>
          `${contact.name} ${contact.whatsapp ?? ""} ${contact.phone ?? ""}`,
      )
      .join(" ");
    return normalizeListSearch(
      `${supplier.name} ${supplier.legal_name ?? ""} ${supplier.document_number ?? ""} ${contacts ?? ""}`,
    ).includes(needle);
  });
  const pagination = parseListPagination(params, filtrados.length);
  const visiveis = filtrados.slice(pagination.start, pagination.end);
  const filtrosAtivos =
    Number(Boolean(busca)) +
    Number(status !== "todos") +
    Number(Boolean(categoria));
  const counts = {
    total: suppliers.length,
    ativos: suppliers.filter((supplier) => supplier.status === "active").length,
    contatos: suppliers.reduce(
      (total, supplier) =>
        total +
        (supplier.supplier_contacts?.filter((contact) => contact.is_active)
          .length ?? 0),
      0,
    ),
  };

  return (
    <>
      {suppliers.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterDialog basePath="/fornecedores" ativos={filtrosAtivos}>
            <SupplierFilterFields
              busca={busca}
              status={status}
              categoria={categoria}
              categories={categories}
              pageSize={pagination.pageSize}
            />
          </FilterDialog>
          <span className="text-fg-subtle text-xs sm:ml-auto">
            {counts.ativos} de {counts.total} ativos · {counts.contatos} contatos
          </span>
        </div>
      ) : null}

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor cadastrado"
          description="Cada fornecedor tem contatos, categorias que atende e histórico próprio de cotações."
          action={
            podeCriar ? (
              <Button asChild size="sm">
                <Link href="/fornecedores/novo">Cadastrar fornecedor</Link>
              </Button>
            ) : null
          }
        />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor neste filtro"
          description="Ajuste a busca, a situação ou a categoria para encontrar outros fornecedores."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/fornecedores">Limpar filtros</Link>
            </Button>
          }
        />
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs">
          <Table>
          <TableHeader>
            <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
              {/* No celular sobram Fornecedor e Situação. CNPJ e contato
                  reaparecem embaixo do nome — e o contato é o que mais importa
                  ver ali: sem ele o fornecedor não entra em rodada. */}
              <TableHead>Fornecedor</TableHead>
              <TableHead className="hidden lg:table-cell">CNPJ</TableHead>
              <TableHead className="hidden sm:table-cell">
                Contato principal
              </TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((supplier) => {
              const principal = supplier.supplier_contacts?.find(
                (c) => c.is_primary && c.is_active,
              );
              return (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <IntentPrefetchLink
                      href={`/fornecedores/${supplier.id}`}
                      className="text-fg hover:text-primary font-medium"
                    >
                      {supplier.name}
                    </IntentPrefetchLink>
                    {supplier.legal_name ? (
                      <span className="text-fg-subtle block text-xs">
                        {supplier.legal_name}
                      </span>
                    ) : null}
                    <span className="text-fg-muted block max-w-40 text-xs whitespace-normal sm:hidden">
                      {principal
                        ? `${principal.name}${
                            principal.whatsapp ?? principal.phone
                              ? ` · ${principal.whatsapp ?? principal.phone}`
                              : ""
                          }`
                        : "sem contato — não entra em rodada"}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted hidden font-mono text-xs lg:table-cell">
                    {formatCnpj(supplier.document_number) || "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted hidden sm:table-cell">
                    {principal ? (
                      <>
                        {principal.name}
                        <span className="text-fg-subtle block text-xs">
                          {principal.whatsapp ?? principal.phone ?? "—"}
                        </span>
                      </>
                    ) : (
                      <span className="text-fg-subtle">
                        sem contato — não entra em rodada
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        supplier.status === "active" ? "default" : "secondary"
                      }
                    >
                      {STATUS_LABEL[supplier.status] ?? supplier.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
          <DataTablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filtrados.length}
          />
        </div>
      )}
    </>
  );
}
