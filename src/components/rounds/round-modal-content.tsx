import { ChevronDown, FileText, PackageSearch, UsersRound } from "lucide-react";

import { GroupChip } from "@/components/rounds/round-crud-forms";
import { CancelRoundForm, CompleteRoundForm } from "@/components/rounds/round-closing";
import { SupplierGroupManager } from "@/components/rounds/supplier-group-manager";
import { SupplierResponseBoard } from "@/components/rounds/supplier-response-board";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DadosDaRodada } from "@/features/rounds/central";
import { GROUP_STATUS_LABEL, ITEM_STATUS_LABEL } from "@/features/rounds/status";

const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export type RoundModalView = "responses" | "distribution" | "scope";

function RoundNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <details className="group border-border bg-surface-sunken mb-4 rounded-xl border">
      <summary className="text-fg-muted flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <FileText className="size-3.5" aria-hidden /> Observações da rodada
        <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <p className="text-fg-muted border-border border-t px-3 py-2.5 text-sm">{note}</p>
    </details>
  );
}

function Responses({ dados }: { dados: DadosDaRodada }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-fg text-base font-semibold">Cobrar respostas</h2>
        <p className="text-fg-muted text-sm">Veja primeiro quem precisa de ação e envie ou reenvie o link sem sair desta tela.</p>
      </div>
      <SupplierResponseBoard
        roundId={dados.round.id}
        canSend={dados.podeEnviar && !dados.encerrada}
        suppliers={dados.roundSuppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.suppliers?.name ?? "Fornecedor",
          contact: supplier.supplier_contacts?.name ?? "Sem contato",
          whatsapp: supplier.supplier_contacts?.whatsapp ?? "",
          contactId: supplier.supplier_contact_id,
          groups: (dados.supplierGroups.get(supplier.id) ?? [])
            .map((groupId) => dados.groupName.get(groupId))
            .filter((name): name is string => Boolean(name)),
          itemCount: supplier.supplier_quotation_items?.filter((item) => item.removed_at === null).length ?? 0,
          answeredCount: supplier.quotation_responses?.[0]?.quotation_response_items?.length ?? 0,
          sentAt: supplier.first_sent_at,
          accessedAt: supplier.first_accessed_at,
          completedAt: supplier.completed_at,
        }))}
      />
    </section>
  );
}

function Distribution({ dados }: { dados: DadosDaRodada }) {
  const groupOptions = dados.groups.map((group) => ({
    ...group,
    itemCount: dados.items.filter((item) => item.group_id === group.id && item.commercial_status !== "cancelled").length,
  }));
  const participants = dados.roundSuppliers.map((supplier) => ({
    roundSupplierId: supplier.id,
    supplierId: supplier.supplier_id,
    name: supplier.suppliers?.name ?? "Fornecedor",
    contactId: supplier.supplier_contact_id,
    contacts: dados.contatos.get(supplier.supplier_id) ?? [],
    groupIds: dados.supplierGroups.get(supplier.id) ?? [],
    firstSentAt: supplier.first_sent_at,
  }));

  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-surface-sunken border-border rounded-lg border p-2"><UsersRound className="text-fg-muted size-4" aria-hidden /></span>
        <div>
          <h2 className="text-fg text-base font-semibold">Distribuição por fornecedor</h2>
          <p className="text-fg-muted text-sm">Defina o contato e os grupos que aparecem no link de cada fornecedor.</p>
        </div>
      </div>

      {dados.podeEditar && !dados.encerrada ? (
        <SupplierGroupManager
          roundId={dados.round.id}
          groups={groupOptions}
          participants={participants}
          suppliers={dados.selectableSuppliers}
          presentation="page"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {participants.map((participant) => (
            <article key={participant.roundSupplierId} className="border-border rounded-xl border p-3">
              <h3 className="text-fg text-sm font-semibold">{participant.name}</h3>
              <p className="text-fg-muted mt-1 text-xs">
                {participant.groupIds.map((id) => dados.groupName.get(id)).filter(Boolean).join(", ") || "Nenhum grupo"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Scope({ dados }: { dados: DadosDaRodada }) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-surface-sunken border-border rounded-lg border p-2"><PackageSearch className="text-fg-muted size-4" aria-hidden /></span>
        <div>
          <h2 className="text-fg text-base font-semibold">Produtos organizados por grupo</h2>
          <p className="text-fg-muted text-sm">Abra somente o grupo que deseja conferir. Grupos ativos começam expandidos.</p>
        </div>
      </div>

      <div className="space-y-3">
        {dados.groups.map((group) => {
          const items = dados.items.filter((item) => item.group_id === group.id);
          const openItems = items.filter((item) => item.commercial_status === "open").length;
          const closed = group.status === "closed" || group.status === "cancelled";
          return (
            <details key={group.id} open={!closed} className="group border-border rounded-xl border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="text-fg-subtle size-4 transition-transform group-open:rotate-180" aria-hidden />
                <span className="text-fg font-semibold">{group.name}</span>
                <span className="text-fg-subtle text-xs">{items.length} {items.length === 1 ? "produto" : "produtos"}</span>
                <Badge className="ml-auto" variant={group.status === "cancelled" ? "destructive" : closed ? "secondary" : "outline"}>
                  {GROUP_STATUS_LABEL[group.status] ?? group.status}
                </Badge>
              </summary>
              <div className="border-border border-t p-3">
                <Table>
                  <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Cotado por</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className={item.commercial_status !== "open" ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">{item.products?.name ?? "Produto"}</TableCell>
                        <TableCell className="text-right tabular-nums">{quantity.format(Number(item.requested_quantity))} <span className="text-fg-subtle text-xs">{item.purchase_unit?.symbol ?? ""}</span></TableCell>
                        <TableCell className="text-fg-muted font-mono text-xs">{item.pricing_unit?.symbol ?? "—"}</TableCell>
                        <TableCell className="text-fg-muted text-xs">{ITEM_STATUS_LABEL[item.commercial_status] ?? item.commercial_status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="border-border mt-3 border-t pt-3">
                  <GroupChip
                    roundId={dados.round.id}
                    groupId={group.id}
                    name={group.name}
                    itemCount={items.length}
                    openItemCount={openItems}
                    status={group.status}
                    editable={false}
                    closable={dados.podeFechar && dados.emAndamento && group.status === "open"}
                    cancellable={dados.podeCancelar && dados.emAndamento && group.status === "open"}
                  />
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {!dados.encerrada && (dados.podeFechar || dados.podeCancelar) ? (
        <details className="group border-border mt-6 rounded-xl border">
          <summary className="text-fg-muted flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Encerramento e ações administrativas
            <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-border flex flex-wrap items-start gap-2 border-t p-4">
            {dados.emAndamento && dados.podeFechar ? <CompleteRoundForm roundId={dados.round.id} openItemCount={dados.itensEmAberto.length} openGroupCount={dados.gruposAbertos.length} /> : null}
            {dados.podeCancelar ? <CancelRoundForm roundId={dados.round.id} /> : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function RoundModalContent({ dados, view }: { dados: DadosDaRodada; view: RoundModalView }) {
  return (
    <>
      <RoundNote note={dados.round.notes} />
      {view === "distribution" ? <Distribution dados={dados} /> : view === "scope" ? <Scope dados={dados} /> : <Responses dados={dados} />}
    </>
  );
}
