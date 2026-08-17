import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/suppliers/contact-form";
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
import { listCategories } from "@/features/products/queries";
import {
  setContactActive,
  setSupplierStatus,
  toggleSupplierCategory,
} from "@/features/suppliers/actions";
import {
  getSupplier,
  listSupplierCategoryIds,
  listSupplierContacts,
} from "@/features/suppliers/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function FornecedorPage({
  params,
}: PageProps<"/fornecedores/[id]">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [supplier, contacts, categories, linkedIds, permissions] =
    await Promise.all([
      getSupplier(company.companyId, id),
      listSupplierContacts(company.companyId, id),
      listCategories(company.companyId),
      listSupplierCategoryIds(company.companyId, id),
      getPermissions(company.companyId),
    ]);

  if (!supplier) notFound();

  const podeEditar = permissions.has("supplier.update");
  const categoriasAtivas = categories.filter((c) => c.isActive);

  return (
    <div className="w-full">
      <PageHeader
        title={supplier.name}
        description={
          supplier.legal_name ??
          "Contatos, categorias atendidas e situação do fornecedor."
        }
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/fornecedores">Voltar</Link>
            </Button>
            {podeEditar ? (
              <form
                action={setSupplierStatus.bind(
                  null,
                  supplier.id,
                  supplier.status === "active" ? "inactive" : "active",
                )}
              >
                <Button type="submit" size="sm" variant="ghost">
                  {supplier.status === "active" ? "Desativar" : "Reativar"}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <section className="border-border bg-surface mb-6 grid gap-4 rounded-xl border p-5 sm:grid-cols-3">
        <div>
          <p className="text-fg-subtle text-xs">CNPJ</p>
          <p className="text-fg font-mono text-sm">
            {formatCnpj(supplier.document_number) || "—"}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Limite de compras</p>
          <p className="text-fg text-sm tabular-nums">
            {supplier.purchase_limit
              ? CURRENCY.format(Number(supplier.purchase_limit))
              : "sem limite definido"}
          </p>
        </div>
        <div>
          <p className="text-fg-subtle text-xs">Situação</p>
          <Badge variant={supplier.status === "active" ? "default" : "secondary"}>
            {STATUS_LABEL[supplier.status] ?? supplier.status}
          </Badge>
        </div>
        {supplier.notes ? (
          <div className="sm:col-span-3">
            <p className="text-fg-subtle text-xs">Observações</p>
            <p className="text-fg-muted text-sm">{supplier.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Contatos</h2>
        <p className="text-fg-muted mb-3 text-sm">
          É para o contato principal que a cotação é enviada.
        </p>

        {podeEditar ? (
          <div className="mb-4">
            <ContactForm supplierId={id} />
          </div>
        ) : null}

        {contacts.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhum contato ainda. Sem contato, este fornecedor não entra numa
            rodada de compras.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Situação</TableHead>
                {podeEditar ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <span className="text-fg font-medium">{contact.name}</span>
                    {contact.role ? (
                      <span className="text-fg-subtle block text-xs">
                        {contact.role}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-fg-muted font-mono text-xs">
                    {contact.whatsapp ?? contact.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted text-xs">
                    {contact.email ?? "—"}
                  </TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    {contact.is_primary && contact.is_active ? (
                      <Badge>Principal</Badge>
                    ) : null}
                    <Badge variant={contact.is_active ? "secondary" : "outline"}>
                      {contact.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  {podeEditar ? (
                    <TableCell>
                      <form
                        action={setContactActive.bind(
                          null,
                          contact.id,
                          id,
                          !contact.is_active,
                        )}
                      >
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-fg-muted whitespace-nowrap"
                        >
                          {contact.is_active ? "Desativar" : "Reativar"}
                        </Button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Categorias atendidas
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Serve para montar a rodada: ao escolher uma categoria, o sistema já
          sabe quem cotar.
        </p>

        {categoriasAtivas.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma categoria ativa nesta empresa.{" "}
            <Link href="/produtos/categorias" className="text-primary">
              Cadastrar categorias
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categoriasAtivas.map((category) => {
              const linked = linkedIds.has(category.id);
              return (
                <form
                  key={category.id}
                  action={toggleSupplierCategory.bind(
                    null,
                    id,
                    category.id,
                    !linked,
                  )}
                >
                  <Button
                    type="submit"
                    size="sm"
                    variant={linked ? "default" : "outline"}
                    disabled={!podeEditar}
                  >
                    {category.name}
                  </Button>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
