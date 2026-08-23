import { Search, Truck } from "lucide-react";
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
import { formatCnpj } from "@/features/company/cnpj";
import { getSupplierCounts, listSuppliers } from "@/features/suppliers/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { normalizeListSearch, parseListPagination } from "@/lib/list-pagination";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

export default async function FornecedoresPage({
  searchParams,
}: PageProps<"/fornecedores">) {
  const company = await requireActiveCompany();
  const [suppliers, counts, permissions] = await Promise.all([
    listSuppliers(company.companyId),
    getSupplierCounts(company.companyId),
    getPermissions(company.companyId),
  ]);

  const podeCriar = permissions.has("supplier.create");
  const params = await searchParams;
  const buscaBruta = Array.isArray(params.busca) ? params.busca[0] : params.busca;
  const busca = (buscaBruta ?? "").trim();
  const statusBruto = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = ["active", "inactive", "blocked"].includes(statusBruto ?? "")
    ? statusBruto
    : "todos";
  const needle = normalizeListSearch(busca);
  const filtrados = suppliers.filter((supplier) => {
    if (status !== "todos" && supplier.status !== status) return false;
    if (!needle) return true;
    const contacts = supplier.supplier_contacts
      ?.map((contact) => `${contact.name} ${contact.whatsapp ?? ""} ${contact.phone ?? ""}`)
      .join(" ");
    return normalizeListSearch(
      `${supplier.name} ${supplier.legal_name ?? ""} ${supplier.document_number ?? ""} ${contacts ?? ""}`,
    ).includes(needle);
  });
  const pagination = parseListPagination(params, filtrados.length);
  const visiveis = filtrados.slice(pagination.start, pagination.end);
  const temFiltro = Boolean(busca) || status !== "todos";

  return (
    <div className="w-full">
      <PageHeader
        title="Fornecedores"
        description={`${counts.ativos} de ${counts.total} ativos · ${counts.contatos} contatos.`}
        action={
          podeCriar ? (
            <Button asChild size="sm">
              <Link href="/fornecedores/novo">Novo fornecedor</Link>
            </Button>
          ) : null
        }
      />

      {suppliers.length > 0 ? (
        <form className="border-border bg-surface mb-4 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="text-fg-subtle pointer-events-none absolute top-2 left-2.5 size-4" aria-hidden />
            <Input
              name="busca"
              defaultValue={busca}
              placeholder="Buscar nome, CNPJ ou contato"
              className="pl-8"
            />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="border-input bg-background text-fg h-8 rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            aria-label="Filtrar fornecedores por situação"
          >
            <option value="todos">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <input type="hidden" name="por_pagina" value={pagination.pageSize} />
          <Button type="submit" size="sm" variant="outline">Filtrar</Button>
          {temFiltro ? <Button asChild size="sm" variant="ghost"><Link href="/fornecedores">Limpar</Link></Button> : null}
        </form>
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
          description="Ajuste a busca ou a situação para encontrar outros fornecedores."
          action={<Button asChild size="sm" variant="outline"><Link href="/fornecedores">Limpar filtros</Link></Button>}
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
                    {/* Sem prefetch: um link de linha por fornecedor viraria
                        uma renderização no servidor por linha visível. */}
                    <Link
                      href={`/fornecedores/${supplier.id}`} prefetch={false}
                      className="text-fg hover:text-primary font-medium"
                    >
                      {supplier.name}
                    </Link>
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
    </div>
  );
}
