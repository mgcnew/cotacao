import { AlertTriangle, CalendarClock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/suppliers/contact-form";
import { SupplierNoticeDialog } from "@/components/suppliers/supplier-notice-dialog";
import { SupplierNoticeStatusActions } from "@/components/suppliers/supplier-notice-status";
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
  listSupplierNotices,
} from "@/features/suppliers/queries";
import {
  formatSupplierNoticeDate,
  isSupplierNoticeOverdue,
  SUPPLIER_NOTICE_KIND_LABEL,
  type SupplierNoticeKind,
} from "@/features/suppliers/notices";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { startWhatsAppConversationAction } from "@/features/whatsapp/actions";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function FornecedorPage({
  params,
}: PageProps<"/fornecedores/[id]">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [supplier, contacts, notices, categories, linkedIds, permissions] =
    await Promise.all([
      getSupplier(company.companyId, id),
      listSupplierContacts(company.companyId, id),
      listSupplierNotices(company.companyId, id),
      listCategories(company.companyId),
      listSupplierCategoryIds(company.companyId, id),
      getPermissions(company.companyId),
    ]);

  if (!supplier) notFound();

  const podeEditar = permissions.has("supplier.update");
  const podeConversar = permissions.has("purchase_round.send");
  const categoriasAtivas = categories.filter((c) => c.isActive);
  const avisosAbertos = notices.filter((notice) => notice.status === "open");
  const historico = notices.filter((notice) => notice.status === "resolved");

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
            <Button asChild size="sm" variant="outline">
              <Link href={`/fornecedores/${id}/historico`}>
                Histórico comercial
              </Link>
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
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-fg flex items-center gap-2 text-sm font-semibold">
              Avisos e combinados
              {avisosAbertos.length > 0 ? (
                <Badge variant="outline">{avisosAbertos.length} em aberto</Badge>
              ) : null}
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              Créditos, alertas e acordos que precisam ser lembrados nas próximas
              compras.
            </p>
          </div>
          {podeEditar ? <SupplierNoticeDialog supplierId={id} /> : null}
        </div>

        {avisosAbertos.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhum aviso ou combinado em aberto.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {avisosAbertos.map((notice) => {
              const overdue = isSupplierNoticeOverdue(notice.due_date);
              const kindLabel =
                SUPPLIER_NOTICE_KIND_LABEL[
                  notice.kind as SupplierNoticeKind
                ] ?? "Registro";
              return (
                <article
                  key={notice.id}
                  className={
                    notice.priority === "high" || overdue
                      ? "border-warning/40 bg-warning/5 rounded-xl border p-4"
                      : "border-border bg-surface rounded-xl border p-4"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={notice.kind === "credit" ? "default" : "secondary"}>
                          {kindLabel}
                        </Badge>
                        {notice.priority === "high" ? (
                          <Badge variant="outline" className="text-warning">
                            <AlertTriangle aria-hidden /> Importante
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="text-fg font-medium">{notice.title}</h3>
                    </div>
                    {notice.amount !== null ? (
                      <strong className="text-fg tabular-nums">
                        {CURRENCY.format(Number(notice.amount))}
                      </strong>
                    ) : null}
                  </div>

                  {notice.description ? (
                    <p className="text-fg-muted mt-2 whitespace-pre-wrap text-sm">
                      {notice.description}
                    </p>
                  ) : null}

                  <div className="text-fg-subtle mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {notice.due_date ? (
                      <span className={overdue ? "text-warning font-medium" : undefined}>
                        <CalendarClock className="mr-1 inline size-3.5" aria-hidden />
                        {overdue ? "Venceu em" : "Válido até"}{" "}
                        {formatSupplierNoticeDate(notice.due_date)}
                      </span>
                    ) : null}
                    <span>
                      Registrado por {notice.created_by_name} em{" "}
                      <time dateTime={notice.created_at}>
                        {DATE_TIME.format(new Date(notice.created_at))}
                      </time>
                    </span>
                  </div>

                  {podeEditar ? (
                    <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-current/10 pt-3">
                      <SupplierNoticeDialog
                        supplierId={id}
                        notice={{
                          id: notice.id,
                          kind: notice.kind,
                          title: notice.title,
                          description: notice.description,
                          amount:
                            notice.amount === null ? null : Number(notice.amount),
                          dueDate: notice.due_date,
                          priority: notice.priority,
                        }}
                      />
                      <SupplierNoticeStatusActions
                        noticeId={notice.id}
                        supplierId={id}
                        status={notice.status}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {historico.length > 0 ? (
          <details className="border-border mt-3 rounded-xl border">
            <summary className="text-fg-muted hover:bg-surface-muted cursor-pointer px-4 py-3 text-sm font-medium">
              Histórico resolvido ({historico.length})
            </summary>
            <div className="divide-border border-border divide-y border-t">
              {historico.map((notice) => (
                <article key={notice.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          {SUPPLIER_NOTICE_KIND_LABEL[
                            notice.kind as SupplierNoticeKind
                          ] ?? "Registro"}
                        </Badge>
                        <span className="text-fg font-medium">{notice.title}</span>
                      </div>
                      {notice.resolution_note ? (
                        <p className="text-fg-muted mt-1 text-sm">
                          {notice.resolution_note}
                        </p>
                      ) : null}
                      <p className="text-fg-subtle mt-1 text-xs">
                        Resolvido por {notice.resolved_by_name ?? "Usuário da equipe"}
                        {notice.resolved_at
                          ? ` em ${DATE_TIME.format(new Date(notice.resolved_at))}`
                          : ""}
                      </p>
                    </div>
                    {podeEditar ? (
                      <SupplierNoticeStatusActions
                        noticeId={notice.id}
                        supplierId={id}
                        status={notice.status}
                      />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </details>
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
                {podeEditar || podeConversar ? <TableHead className="w-0" /> : null}
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
                  {podeEditar || podeConversar ? (
                    <TableCell className="space-y-1">
                      {podeConversar && contact.is_active && contact.whatsapp ? (
                        <form action={startWhatsAppConversationAction}>
                          <input type="hidden" name="contact_id" value={contact.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Conversar
                          </Button>
                        </form>
                      ) : null}
                      {podeEditar ? (
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
                      ) : null}
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
