import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
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
import { activateRound } from "@/features/rounds/actions";
import { markSupplierSent } from "@/features/rounds/send";
import {
  getRound,
  listRoundGroups,
  listRoundItems,
  listRoundSuppliers,
  listSelectableSuppliers,
} from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

const STATUS_LABEL: Record<string, string> = {
  draft: "Preparação",
  active: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
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
  // Depois de iniciada, a rodada só muda por atualização controlada — isso é
  // etapa seguinte, com token e reenvio. Aqui a montagem se encerra.
  const podeMontar = podeEditar && emPreparacao;

  const [products, selectableSuppliers] = await Promise.all([
    podeMontar ? listProducts(company.companyId) : Promise.resolve([]),
    podeMontar ? listSelectableSuppliers(company.companyId) : Promise.resolve([]),
  ]);

  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={round.title}
        description={`${items.length} itens · ${groups.length} grupos · ${roundSuppliers.length} fornecedores`}
        action={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/compras">Voltar</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/compras/${id}/comparacao`}>Comparar respostas</Link>
            </Button>
            <Badge variant={round.status === "active" ? "default" : "secondary"}>
              {STATUS_LABEL[round.status] ?? round.status}
            </Badge>
            {podeMontar ? (
              <form action={activateRound.bind(null, round.id)}>
                <Button type="submit" size="sm">
                  Iniciar rodada
                </Button>
              </form>
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
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <Badge key={group.id} variant="secondary">
                {group.name}
              </Badge>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.products?.name}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {groupName.get(item.group_id) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {QTY.format(Number(item.requested_quantity))}{" "}
                    <span className="text-fg-subtle text-xs">
                      {item.purchase_unit?.symbol}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted font-mono text-xs">
                    {item.pricing_unit?.symbol}
                  </TableCell>
                  <TableCell className="text-fg-muted text-xs">
                    {item.commercial_status === "open"
                      ? "Aberto"
                      : item.commercial_status}
                  </TableCell>
                </TableRow>
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
                {podeEnviar ? <TableHead className="w-0" /> : null}
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
                      <div className="flex flex-col items-end gap-2">
                        <SendControls
                          roundSupplierId={rs.id}
                          roundId={id}
                        />
                        {rs.first_sent_at ? null : (
                          <form
                            action={markSupplierSent.bind(null, rs.id, id)}
                          >
                            <Button type="submit" size="sm" variant="outline">
                              Marquei como enviado
                            </Button>
                          </form>
                        )}
                      </div>
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
