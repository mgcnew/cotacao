import { Truck } from "lucide-react";
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
import { formatCnpj } from "@/features/company/cnpj";
import { getSupplierCounts, listSuppliers } from "@/features/suppliers/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

export default async function FornecedoresPage() {
  const company = await requireActiveCompany();
  const [suppliers, counts, permissions] = await Promise.all([
    listSuppliers(company.companyId),
    getSupplierCounts(company.companyId),
    getPermissions(company.companyId),
  ]);

  const podeCriar = permissions.has("supplier.create");

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
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
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
            {suppliers.map((supplier) => {
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
      )}
    </div>
  );
}
