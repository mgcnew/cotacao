import { AlertTriangle, CalendarClock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CardSkeleton, SectionTitleSkeleton } from "@/components/layout/page-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/suppliers/contact-form";
import { SupplierScheduleManager } from "@/components/suppliers/supplier-schedule-manager";
import { SupplierNoticeDialog } from "@/components/suppliers/supplier-notice-dialog";
import { SupplierNoticeStatusActions } from "@/components/suppliers/supplier-notice-status";
import { SupplierStatusToggle } from "@/components/suppliers/supplier-status-toggle";
import { SupplierTabs } from "@/components/suppliers/supplier-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCnpj } from "@/features/company/cnpj";
import { getCompany } from "@/features/company/queries";
import { listCategories } from "@/features/products/queries";
import { carregarFornecedor } from "@/features/suppliers/central";
import { parseSupplierTab, type SupplierTab } from "@/features/suppliers/tabs";
import {
  setContactActive,
  toggleSupplierCategory,
} from "@/features/suppliers/actions";
import {
  listSupplierCategoryIds,
  listSupplierContacts,
  listSupplierNotices,
} from "@/features/suppliers/queries";
import {
  listSupplierPurchaseSchedules,
  listSupplierScheduleTemplateItems,
  listScheduleProductOptions,
} from "@/features/suppliers/schedules";
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
  searchParams,
}: PageProps<"/fornecedores/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <FornecedorContent id={id} aba={parseSupplierTab(query)} />;
}

/**
 * O fornecedor, servindo à página inteira e ao modal da lista.
 *
 * POR QUE CADA ABA CARREGA O SEU
 *
 * Antes as dez consultas do fornecedor saíam juntas e a tela só aparecia
 * quando a última chegasse — inclusive o catálogo inteiro de produtos, que só
 * o modelo de compra usa. Agora quem abre o cadastro paga o cadastro.
 *
 * A `key` no `<Suspense>` é o que faz o esqueleto reaparecer a cada troca de
 * aba: sem ela o React reaproveitaria a fronteira e a tela ficaria parada no
 * conteúdo antigo até o novo chegar, sem dizer que está trabalhando.
 */
export async function FornecedorContent({
  id,
  aba,
  emModal = false,
}: {
  id: string;
  aba: SupplierTab;
  emModal?: boolean;
}) {
  const supplier = await carregarFornecedor(id);
  if (!supplier) notFound();

  const corpo = (
    <Suspense
      key={aba}
      fallback={
        <div className="flex flex-col gap-4">
          <SectionTitleSkeleton lines={2} />
          <CardSkeleton lines={4} />
        </div>
      }
    >
      {aba === "contatos" ? (
        <AbaContatos id={id} />
      ) : aba === "agenda" ? (
        <AbaModeloDeCompra id={id} />
      ) : aba === "avisos" ? (
        <AbaAvisos id={id} />
      ) : (
        <AbaCadastro id={id} emModal={emModal} />
      )}
    </Suspense>
  );

  if (emModal) return <DialogBody>{corpo}</DialogBody>;

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
            <Badge
              variant={supplier.status === "active" ? "default" : "secondary"}
            >
              {STATUS_LABEL[supplier.status] ?? supplier.status}
            </Badge>
            <PodeEditar>
              <SupplierStatusToggle
                supplierId={supplier.id}
                status={supplier.status}
              />
            </PodeEditar>
          </>
        }
      />
      <div className="border-border -mx-4 mb-6 border-b sm:mx-0">
        <SupplierTabs supplierId={id} />
      </div>
      {corpo}
    </div>
  );
}

/** Esconde o filho de quem não pode editar o fornecedor. */
async function PodeEditar({ children }: { children: React.ReactNode }) {
  const company = await requireActiveCompany();
  const permissions = await getPermissions(company.companyId);
  return permissions.has("supplier.update") ? <>{children}</> : null;
}

// ============================================================
// ABAS
// ============================================================

async function AbaCadastro({ id, emModal }: { id: string; emModal: boolean }) {
  const company = await requireActiveCompany();
  const [supplier, categories, linkedIds, permissions] = await Promise.all([
    carregarFornecedor(id),
    listCategories(company.companyId),
    listSupplierCategoryIds(company.companyId, id),
    getPermissions(company.companyId),
  ]);
  if (!supplier) notFound();

  const podeEditar = permissions.has("supplier.update");
  const categoriasAtivas = categories.filter((c) => c.isActive);

  return (
    <>
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
        {/* No modal a situação já está no cabeçalho, ao lado do nome. */}
        {emModal ? null : (
          <div>
            <p className="text-fg-subtle text-xs">Situação</p>
            <Badge
              variant={supplier.status === "active" ? "default" : "secondary"}
            >
              {STATUS_LABEL[supplier.status] ?? supplier.status}
            </Badge>
          </div>
        )}
        {supplier.notes ? (
          <div className="sm:col-span-3">
            <p className="text-fg-subtle text-xs">Observações</p>
            <p className="text-fg-muted text-sm">{supplier.notes}</p>
          </div>
        ) : null}
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
    </>
  );
}

async function AbaContatos({ id }: { id: string }) {
  const company = await requireActiveCompany();
  const [contacts, permissions] = await Promise.all([
    listSupplierContacts(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  const podeEditar = permissions.has("supplier.update");
  const podeConversar = permissions.has("purchase_round.send");

  return (
    <section>
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
              {podeEditar || podeConversar ? (
                <TableHead className="w-0" />
              ) : null}
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
                        <input
                          type="hidden"
                          name="contact_id"
                          value={contact.id}
                        />
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
  );
}

async function AbaModeloDeCompra({ id }: { id: string }) {
  const company = await requireActiveCompany();
  const [
    schedules,
    templateItems,
    products,
    categories,
    permissions,
    companyDetails,
  ] = await Promise.all([
    listSupplierPurchaseSchedules(company.companyId, id),
    listSupplierScheduleTemplateItems(company.companyId, id),
    listScheduleProductOptions(company.companyId),
    listCategories(company.companyId),
    getPermissions(company.companyId),
    getCompany(company.companyId),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: companyDetails?.timezone ?? "America/Sao_Paulo",
  }).format(new Date());

  return (
    <SupplierScheduleManager
      supplierId={id}
      schedules={schedules}
      templateItems={templateItems}
      products={products}
      categories={categories.filter((c) => c.isActive)}
      today={today}
      canManage={permissions.has("supplier.update")}
    />
  );
}

async function AbaAvisos({ id }: { id: string }) {
  const company = await requireActiveCompany();
  const [notices, permissions] = await Promise.all([
    listSupplierNotices(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  const podeEditar = permissions.has("supplier.update");
  const avisosAbertos = notices.filter((notice) => notice.status === "open");
  const resolvidos = notices.filter((notice) => notice.status === "resolved");

  return (
    <section>
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
              SUPPLIER_NOTICE_KIND_LABEL[notice.kind as SupplierNoticeKind] ??
              "Registro";
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
                      <Badge
                        variant={
                          notice.kind === "credit" ? "default" : "secondary"
                        }
                      >
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
                  <p className="text-fg-muted mt-2 text-sm whitespace-pre-wrap">
                    {notice.description}
                  </p>
                ) : null}

                <div className="text-fg-subtle mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {notice.due_date ? (
                    <span
                      className={
                        overdue ? "text-warning font-medium" : undefined
                      }
                    >
                      <CalendarClock
                        className="mr-1 inline size-3.5"
                        aria-hidden
                      />
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

      {resolvidos.length > 0 ? (
        <details className="border-border mt-3 rounded-xl border">
          <summary className="text-fg-muted hover:bg-surface-muted cursor-pointer px-4 py-3 text-sm font-medium">
            Histórico resolvido ({resolvidos.length})
          </summary>
          <div className="divide-border border-border divide-y border-t">
            {resolvidos.map((notice) => (
              <article key={notice.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {SUPPLIER_NOTICE_KIND_LABEL[
                          notice.kind as SupplierNoticeKind
                        ] ?? "Registro"}
                      </Badge>
                      <span className="text-fg font-medium">
                        {notice.title}
                      </span>
                    </div>
                    {notice.resolution_note ? (
                      <p className="text-fg-muted mt-1 text-sm">
                        {notice.resolution_note}
                      </p>
                    ) : null}
                    <p className="text-fg-subtle mt-1 text-xs">
                      Resolvido por{" "}
                      {notice.resolved_by_name ?? "Usuário da equipe"}
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
  );
}
