import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  ContactPicker,
  EditRoundForm,
  GroupChip,
  QuotationItemRow,
} from "@/components/rounds/round-crud-forms";
import {
  ActivateRoundForm,
  GroupForm,
  ItemForm,
  SupplierPickerForm,
} from "@/components/rounds/round-forms";
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
import { SendControls } from "@/components/rounds/send-controls";
import { listProducts } from "@/features/products/queries";
import {
  getRound,
  listRoundGroups,
  listRoundItems,
  listRoundSupplierContacts,
  listRoundSuppliers,
  listSelectableSuppliers,
} from "@/features/rounds/queries";
import {
  ROUND_STATUS_LABEL,
  roundStatusTone,
} from "@/features/rounds/status";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RodadaPage({
  params,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;
  const company = await requireActiveCompany();

  const [round, groups, items, roundSuppliers, permissions] = await Promise.all([
    getRound(company.companyId, id),
    listRoundGroups(company.companyId, id),
    listRoundItems(company.companyId, id),
    listRoundSuppliers(company.companyId, id),
    getPermissions(company.companyId),
  ]);

  if (!round) notFound();

  const podeEditar = permissions.has("purchase_round.update");
  const podeEnviar = permissions.has("purchase_round.send");
  const emPreparacao = round.status === "draft";
  const encerrada =
    round.status === "completed" || round.status === "cancelled";
  // Depois de iniciada, a rodada só muda por atualização controlada — isso é
  // etapa seguinte, com token e reenvio. Aqui a montagem se encerra.
  const podeMontar = podeEditar && emPreparacao;

  const [products, selectableSuppliers, contatos] = await Promise.all([
    podeMontar ? listProducts(company.companyId) : Promise.resolve([]),
    podeMontar ? listSelectableSuppliers(company.companyId) : Promise.resolve([]),
    // Só há o que trocar quando o fornecedor tem mais de um contato ativo; a
    // consulta é uma para a tabela toda, não uma por linha.
    podeEditar && !encerrada
      ? listRoundSupplierContacts(
          company.companyId,
          roundSuppliers.map((rs) => rs.supplier_id),
        )
      : Promise.resolve(new Map()),
  ]);

  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <div className="w-full">
      <PageHeader
        title={round.title}
        description={`${items.length} itens · ${groups.length} grupos · ${roundSuppliers.length} fornecedores`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/compras">Voltar</Link>
            </Button>
            {podeEditar && !encerrada ? (
              <EditRoundForm
                roundId={round.id}
                title={round.title}
                notes={round.notes}
              />
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/comparacao`}>Comparar respostas</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/alocacao`}>Decidir compra</Link>
            </Button>
            <Badge variant={roundStatusTone(round.status)}>
              {ROUND_STATUS_LABEL[round.status] ?? round.status}
            </Badge>
            {podeMontar ? (
              <ActivateRoundForm
                roundId={round.id}
                itemCount={items.length}
                supplierCount={roundSuppliers.length}
              />
            ) : null}
          </>
        }
      />

      {round.notes ? (
        <p className="text-fg-muted border-border bg-surface-sunken mb-6 rounded-xl border px-4 py-3 text-sm">
          {round.notes}
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Grupos</h2>
        <p className="text-fg-muted mb-3 text-sm">
          Organizam os produtos dentro da cotação. Um mesmo fornecedor recebe um
          link só, com os itens separados por grupo.
        </p>

        {podeMontar ? (
          <div className="mb-4">
            <GroupForm roundId={id} />
          </div>
        ) : null}

        {groups.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhum grupo ainda. O produto precisa de um grupo para entrar na
            rodada.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((group) => (
              <GroupChip
                key={group.id}
                roundId={id}
                groupId={group.id}
                name={group.name}
                itemCount={
                  items.filter((i) => i.group_id === group.id).length
                }
                editable={podeMontar}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Itens</h2>
        <p className="text-fg-muted mb-3 text-sm">
          O que será cotado, com a quantidade que você pretende comprar.
        </p>

        {podeMontar && groups.length > 0 && products.length > 0 ? (
          <div className="mb-4">
            <ItemForm
              roundId={id}
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
              products={products
                .filter((p) => p.is_active)
                .map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            {groups.length === 0
              ? "Crie um grupo antes de adicionar produtos."
              : "Nenhum produto na rodada ainda."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Cotado por</TableHead>
                <TableHead>Situação</TableHead>
                {podeMontar ? (
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Ações do item</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <QuotationItemRow
                  key={item.id}
                  roundId={id}
                  itemId={item.id}
                  productName={item.products?.name ?? "Produto"}
                  groupId={item.group_id}
                  groupName={groupName.get(item.group_id) ?? "—"}
                  quantity={Number(item.requested_quantity)}
                  purchaseUnit={item.purchase_unit?.symbol ?? ""}
                  pricingUnit={item.pricing_unit?.symbol ?? ""}
                  removed={item.commercial_status === "cancelled"}
                  editable={podeMontar}
                  groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Fornecedores convidados
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Cada um recebe um link próprio, com os itens organizados por grupo.
          Gere o link, mande pelo seu canal e registre o envio.
        </p>

        {podeMontar && selectableSuppliers.length > 0 ? (
          <div className="mb-4">
            <SupplierPickerForm
              roundId={id}
              suppliers={selectableSuppliers.filter(
                (s) => !roundSuppliers.some((rs) => rs.supplier_id === s.id),
              )}
            />
          </div>
        ) : null}

        {roundSuppliers.length === 0 ? (
          <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhum fornecedor convidado.{" "}
            {selectableSuppliers.length === 0 && podeMontar ? (
              <>
                Nenhum fornecedor ativo com contato —{" "}
                <Link href="/fornecedores" className="text-primary">
                  cadastre um
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Abriu o link</TableHead>
                <TableHead>Respondeu</TableHead>
                {podeEnviar ? (
                  // Cabeçalho vazio deixa a coluna sem nome para quem usa
                  // leitor de tela. O rótulo existe, apenas não é desenhado.
                  <TableHead className="w-0">
                    <span className="sr-only">Envio</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roundSuppliers.map((rs) => (
                <TableRow key={rs.id}>
                  <TableCell className="font-medium">
                    {rs.suppliers?.name}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {rs.supplier_contacts?.name ?? "—"}
                    <span className="text-fg-subtle block font-mono text-xs">
                      {rs.supplier_contacts?.whatsapp ?? ""}
                    </span>
                    {podeEditar && !encerrada ? (
                      <ContactPicker
                        roundId={id}
                        roundSupplierId={rs.id}
                        contactId={rs.supplier_contact_id}
                        contacts={contatos.get(rs.supplier_id) ?? []}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-fg-muted text-xs">
                    {rs.first_sent_at
                      ? DATA_HORA.format(new Date(rs.first_sent_at))
                      : "ainda não"}
                  </TableCell>
                  <TableCell className="text-fg-muted text-xs">
                    {rs.first_accessed_at
                      ? DATA_HORA.format(new Date(rs.first_accessed_at))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {/* Contagem de itens respondidos: é o sinal que o comprador
                        procura depois de mandar o link. */}
                    {(() => {
                      // quotation_responses tem UNIQUE (round_supplier_id), ou
                      // seja é no máximo uma — mas o PostgREST devolve lista.
                      const respondidos =
                        rs.quotation_responses?.[0]?.quotation_response_items
                          ?.length ?? 0;
                      if (respondidos === 0) {
                        return <span className="text-fg-subtle">—</span>;
                      }
                      return (
                        <>
                          <Badge
                            variant={rs.completed_at ? "default" : "secondary"}
                          >
                            {respondidos} de {items.length}
                          </Badge>
                          {rs.completed_at ? (
                            <span className="text-fg-subtle mt-0.5 block">
                              {DATA_HORA.format(new Date(rs.completed_at))}
                            </span>
                          ) : null}
                        </>
                      );
                    })()}
                  </TableCell>
                  {podeEnviar ? (
                    <TableCell>
                      <SendControls
                        roundSupplierId={rs.id}
                        roundId={id}
                        supplierName={rs.suppliers?.name ?? "fornecedor"}
                        alreadySent={rs.first_sent_at !== null}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
