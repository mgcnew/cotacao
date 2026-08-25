import { ArrowRight, Package, Users } from "lucide-react";
import Link from "next/link";

import { Suspense } from "react";

import { Disclosure } from "@/components/layout/disclosure";
import { MetricsSkeleton } from "@/components/layout/page-skeleton";
import {
  ContactPicker,
  EditRoundForm,
  GroupChip,
  QuotationItemRow,
} from "@/components/rounds/round-crud-forms";
import {
  CancelRoundForm,
  CompleteRoundForm,
} from "@/components/rounds/round-closing";
import {
  GroupForm,
  ItemForm,
  ShoppingListImportForm,
  StartRoundPanel,
  SupplierPickerForm,
} from "@/components/rounds/round-forms";
import { IndicadoresDaRodada } from "@/components/rounds/round-indicators";
import { RoundSteps } from "@/components/rounds/round-steps";
import { SendControls } from "@/components/rounds/send-controls";
import { SupplierGroupManager } from "@/components/rounds/supplier-group-manager";
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
import type { listProducts } from "@/features/products/queries";
import type { DadosDaRodada } from "@/features/rounds/central";
import { GRUPO_PADRAO } from "@/features/rounds/groups";
import type {
  listRoundItems,
  listRoundSupplierContacts,
  listRoundSuppliers,
} from "@/features/rounds/queries";
import { ROUND_STATUS_LABEL, roundStatusTone } from "@/features/rounds/status";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A Central da Rodada, desenhada uma vez e usada em dois lugares.
 *
 * A mesma rodada aparece como página inteira, em `/compras/[id]`, e como modal
 * por cima da lista de compras. Página e modal diferem no que os embrulha —
 * cabeçalho de página com "Voltar", ou cabeçalho de modal com o X —, e em nada
 * mais: as mesmas seções, as mesmas regras, os mesmos formulários.
 *
 * A Central tem duas vidas, e elas continuam sendo duas telas por dentro.
 *
 * EM PREPARAÇÃO ela é uma montagem: produtos, fornecedores, iniciar. Nessa
 * fase, colunas como "enviado", "abriu o link" e "respondeu" só podem estar
 * vazias — nada foi enviado —, e "comparar respostas" leva a uma tela em
 * branco. Mostrar tudo isso era encher a tela de perguntas sem resposta e
 * deixar quem chegou hoje sem saber por onde começar.
 *
 * DEPOIS DE INICIADA ela é acompanhamento: quem recebeu, quem abriu, quem
 * respondeu — e é aí que aquelas colunas passam a valer.
 */

/** A linha de resumo que vai embaixo do título, na página e no modal. */
export function descreverRodada(dados: DadosDaRodada): string {
  if (dados.emPreparacao) {
    return "Em preparação: monte a cotação aqui e nada sai daqui até você iniciá-la.";
  }
  return `${dados.itensAtivos.length} itens · ${dados.groups.length} grupos · ${dados.roundSuppliers.length} fornecedores`;
}

/**
 * As ações da rodada: editar, comparar, decidir, e a situação.
 *
 * "Voltar" não está aqui de propósito — na página ele é um link para a lista,
 * no modal ele é o X que já existe no canto. Quem embrulha decide como se sai.
 */
export function AcoesDaRodada({
  dados,
  showEdit = true,
}: {
  dados: DadosDaRodada;
  showEdit?: boolean;
}) {
  const id = dados.round.id;

  return (
    <>
      {showEdit && dados.podeEditar && !dados.encerrada ? (
        <EditRoundForm
          roundId={id}
          title={dados.round.title}
          notes={dados.round.notes}
        />
      ) : null}
      {/* Antes de iniciar não há resposta para comparar nem compra para
          decidir: os dois botões levavam a telas vazias. */}
      {dados.emPreparacao ? null : (
        <>
          <Button asChild size="sm" variant="outline">
            <Link href={`/compras/${id}/comparacao`}>Comparar respostas</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/compras/${id}/alocacao`}>Decidir compra</Link>
          </Button>
        </>
      )}
      <Badge variant={roundStatusTone(dados.round.status)}>
        {ROUND_STATUS_LABEL[dados.round.status] ?? dados.round.status}
      </Badge>
      {dados.parcialmenteFechada ? (
        <Badge variant="secondary">Parcialmente fechada</Badge>
      ) : null}
    </>
  );
}

/** O miolo: observações, a vida da rodada, e o encerramento no fim. */
export function CorpoDaRodada({ dados }: { dados: DadosDaRodada }) {
  const id = dados.round.id;

  return (
    <>
      {dados.round.notes ? (
        <p className="text-fg-muted border-border bg-surface-sunken mb-6 rounded-xl border px-4 py-3 text-sm">
          {dados.round.notes}
        </p>
      ) : null}

      {dados.emPreparacao ? (
        <Montagem
          roundId={id}
          podeMontar={dados.podeMontar}
          groups={dados.groups}
          groupName={dados.groupName}
          items={dados.items}
          itensAtivos={dados.itensAtivos.length}
          products={dados.products}
          shoppingItems={dados.shoppingItems}
          roundSuppliers={dados.roundSuppliers}
          selectableSuppliers={dados.selectableSuppliers}
          contatos={dados.contatos}
          podeEditar={dados.podeEditar}
        />
      ) : (
        <Acompanhamento
          roundId={id}
          roundStatus={dados.round.status}
          companyName={dados.companyName}
          roundTitle={dados.round.title}
          items={dados.items}
          groups={dados.groups}
          groupName={dados.groupName}
          roundSuppliers={dados.roundSuppliers}
          contatos={dados.contatos}
          supplierGroups={dados.supplierGroups}
          latestReminders={dados.latestReminders}
          selectableSuppliers={dados.selectableSuppliers}
          podeEditar={dados.podeEditar}
          podeEnviar={dados.podeEnviar}
          whatsappReady={dados.whatsappReady}
          invitationTemplate={dados.whatsappTemplates.quotation_invitation}
          podeFechar={dados.podeFechar && dados.emAndamento}
          podeCancelarGrupo={dados.podeCancelar && dados.emAndamento}
          encerrada={dados.encerrada}
        />
      )}

      {/* O encerramento fica no fim, e não no cabeçalho: é a última decisão da
          tela, tomada depois de olhar o que está nela. No cabeçalho, o painel
          de confirmação — que é largo — espremia o título em três linhas. */}
      {!dados.encerrada && (dados.podeFechar || dados.podeCancelar) ? (
        <section
          id="encerrar-rodada"
          className="border-border mt-6 scroll-mt-6 border-t pt-4"
        >
          <h2 className="text-fg mb-1 text-sm font-semibold">
            Encerrar a rodada
          </h2>
          <p className="text-fg-muted mb-3 text-sm">
            {dados.emAndamento
              ? "Concluída, ela sai da lista do dia a dia e os links dos fornecedores param de valer. Cancelada, é como se não tivesse acontecido — e por isso o banco recusa cancelar uma que já virou pedido."
              : "Rodada em preparação pode ser cancelada a qualquer momento; nada foi enviado."}
          </p>
          <div className="flex flex-wrap items-start gap-2">
            {dados.emAndamento && dados.podeFechar ? (
              <CompleteRoundForm
                roundId={id}
                openItemCount={dados.itensEmAberto.length}
                openGroupCount={dados.gruposAbertos.length}
              />
            ) : null}
            {dados.podeCancelar ? <CancelRoundForm roundId={id} /> : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * Os tipos vêm das próprias consultas.
 *
 * Escrever a forma da linha à mão aqui seria copiar o `select` do PostgREST
 * para um segundo lugar — e um `select` que ganha uma coluna deixa a cópia
 * mentindo sem que nada quebre.
 */
type Grupo = { id: string; name: string; status: string };
type Item = Awaited<ReturnType<typeof listRoundItems>>[number];
type RoundSupplier = Awaited<ReturnType<typeof listRoundSuppliers>>[number];
type Contatos = Awaited<ReturnType<typeof listRoundSupplierContacts>>;
type Produto = Awaited<ReturnType<typeof listProducts>>[number];

/** A rodada em preparação: a trilha de montagem. */
function Montagem({
  roundId,
  podeMontar,
  podeEditar,
  groups,
  groupName,
  items,
  itensAtivos,
  products,
  shoppingItems,
  roundSuppliers,
  selectableSuppliers,
  contatos,
}: {
  roundId: string;
  podeMontar: boolean;
  podeEditar: boolean;
  groups: Grupo[];
  groupName: Map<string, string>;
  items: Item[];
  itensAtivos: number;
  products: Produto[];
  shoppingItems: DadosDaRodada["shoppingItems"];
  roundSuppliers: RoundSupplier[];
  selectableSuppliers: DadosDaRodada["selectableSuppliers"];
  contatos: Contatos;
}) {
  const temItens = itensAtivos > 0;
  const temFornecedores = roundSuppliers.length > 0;
  const pronto = temItens && temFornecedores;

  const produtosAtivos = products.filter((p) => p.is_active);
  const disponiveis = selectableSuppliers.filter(
    (s) => !roundSuppliers.some((rs) => rs.supplier_id === s.id),
  );

  // A rodada nasce com um grupo só, chamado "Geral". Enquanto ninguém mexer
  // nisso — renomeando ou criando um segundo —, grupo é um assunto que não
  // precisa existir para quem está montando. Zero grupos entra aqui também:
  // são as rodadas criadas antes de a rodada passar a nascer com um.
  const organizouGrupos =
    groups.length > 1 ||
    (groups.length === 1 && groups[0].name !== GRUPO_PADRAO);
  const grupoIntocado = !organizouGrupos;

  return (
    <>
      <RoundSteps
        passos={[
          {
            chave: "produtos",
            titulo: "Produtos",
            resumo: temItens
              ? `${itensAtivos} ${itensAtivos === 1 ? "produto" : "produtos"}`
              : "nenhum ainda",
            estado: temItens ? "feito" : "agora",
            painel: (
              <section>
                <h2 className="text-fg mb-1 text-base font-semibold">
                  1 · Produtos
                </h2>
                <p className="text-fg-muted mb-4 text-sm">
                  O que você quer cotar, e quanto pretende comprar de cada. É
                  esta lista que cada fornecedor vai receber para preencher com
                  o preço dele.
                </p>

                {podeMontar && produtosAtivos.length === 0 ? (
                  <Aviso
                    icone={Package}
                    titulo="Nenhum produto no catálogo ainda"
                    texto="A rodada cota produtos cadastrados — é o cadastro que guarda as unidades de compra e de preço, sem as quais não há como comparar propostas."
                    acao={{
                      href: "/produtos/novo",
                      label: "Cadastrar produto",
                    }}
                  />
                ) : null}

                {podeMontar && produtosAtivos.length > 0 ? (
                  <div className="mb-4 flex flex-col gap-3">
                    <ItemForm
                      roundId={roundId}
                      groups={groups}
                      products={produtosAtivos.map((p) => ({
                        id: p.id,
                        name: p.name,
                      }))}
                    />
                    {shoppingItems.length > 0 ? (
                      <ShoppingListImportForm
                        roundId={roundId}
                        groups={groups}
                        items={shoppingItems}
                      />
                    ) : null}
                  </div>
                ) : null}

                {items.length === 0 ? (
                  <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
                    Nenhum produto na rodada ainda.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        {!grupoIntocado ? <TableHead>Grupo</TableHead> : null}
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
                          roundId={roundId}
                          itemId={item.id}
                          productName={item.products?.name ?? "Produto"}
                          groupId={item.group_id}
                          groupName={groupName.get(item.group_id) ?? "—"}
                          quantity={Number(item.requested_quantity)}
                          purchaseUnit={item.purchase_unit?.symbol ?? ""}
                          pricingUnit={item.pricing_unit?.symbol ?? ""}
                          commercialStatus={item.commercial_status}
                          editable={podeMontar}
                          groups={groups}
                          hideGroup={grupoIntocado}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}

                {podeMontar ? (
                  <div className="mt-4">
                    <Disclosure
                      titulo="Separar os produtos em grupos"
                      resumo={
                        grupoIntocado
                          ? "Opcional. Serve para cotar frios e hortifrúti no mesmo link, separados."
                          : `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} nesta rodada.`
                      }
                      aberto={organizouGrupos}
                    >
                      <div className="flex flex-col gap-4">
                        <p className="text-fg-muted text-sm">
                          O grupo organiza a cotação por dentro: o fornecedor
                          continua recebendo um link só, com os itens separados
                          por seção. É diferente da categoria do produto, que é
                          do catálogo.
                        </p>
                        <GroupForm roundId={roundId} />
                        <div className="flex flex-wrap items-center gap-2">
                          {groups.map((group) => (
                            <GroupChip
                              key={group.id}
                              roundId={roundId}
                              groupId={group.id}
                              name={group.name}
                              itemCount={
                                items.filter((i) => i.group_id === group.id)
                                  .length
                              }
                              editable={podeMontar}
                            />
                          ))}
                        </div>
                      </div>
                    </Disclosure>
                  </div>
                ) : null}
              </section>
            ),
          },
          {
            chave: "fornecedores",
            titulo: "Fornecedores",
            resumo: temFornecedores
              ? `${roundSuppliers.length} ${roundSuppliers.length === 1 ? "convidado" : "convidados"}`
              : "nenhum ainda",
            estado: temFornecedores ? "feito" : temItens ? "agora" : "depois",
            painel: (
              <section>
                <h2 className="text-fg mb-1 text-base font-semibold">
                  2 · Fornecedores
                </h2>
                <p className="text-fg-muted mb-4 text-sm">
                  Quem você quer que dê preço. Cada um recebe o link da rodada
                  preenchido com os seus itens — e não vê o preço dos outros.
                </p>

                {podeMontar && selectableSuppliers.length === 0 ? (
                  <Aviso
                    icone={Users}
                    titulo="Nenhum fornecedor com contato ativo"
                    texto="Para receber o link, o fornecedor precisa de um contato com WhatsApp cadastrado. É por ele que a cotação chega."
                    acao={{
                      href: "/fornecedores/novo",
                      label: "Cadastrar fornecedor",
                    }}
                  />
                ) : null}

                {podeMontar && disponiveis.length > 0 ? (
                  <div className="mb-4">
                    <SupplierPickerForm
                      roundId={roundId}
                      suppliers={disponiveis}
                    />
                  </div>
                ) : null}

                {roundSuppliers.length === 0 ? (
                  <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
                    Nenhum fornecedor convidado ainda.
                  </p>
                ) : (
                  // Em preparação a lista é só quem foi convidado e por qual contato.
                  // As colunas de envio e resposta viriam todas vazias.
                  <ul className="flex flex-col gap-2">
                    {roundSuppliers.map((rs) => (
                      <li
                        key={rs.id}
                        className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                      >
                        <span className="min-w-0">
                          <span className="text-fg block text-sm font-medium">
                            {rs.suppliers?.name}
                          </span>
                          <span className="text-fg-muted block text-xs">
                            {rs.supplier_contacts?.name ?? "sem contato"}
                            {rs.supplier_contacts?.whatsapp
                              ? ` · ${rs.supplier_contacts.whatsapp}`
                              : ""}
                          </span>
                        </span>
                        {podeEditar ? (
                          <ContactPicker
                            roundId={roundId}
                            roundSupplierId={rs.id}
                            contactId={rs.supplier_contact_id}
                            contacts={contatos.get(rs.supplier_id) ?? []}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ),
          },
          {
            chave: "iniciar",
            titulo: "Conferir e iniciar",
            resumo: pronto ? "tudo pronto" : "depois dos dois acima",
            estado: pronto ? "agora" : "depois",
            painel: (
              <section>
                <h2 className="text-fg mb-1 text-base font-semibold">
                  3 · Conferir e iniciar
                </h2>
                <p className="text-fg-muted mb-4 text-sm">
                  Última olhada antes de a rodada valer.
                </p>

                {podeMontar ? (
                  <StartRoundPanel
                    roundId={roundId}
                    itemCount={itensAtivos}
                    supplierCount={roundSuppliers.length}
                  />
                ) : (
                  <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-6 text-sm">
                    Seu papel não permite iniciar rodadas.
                  </p>
                )}
              </section>
            ),
          },
        ]}
      />
    </>
  );
}

/** A rodada já iniciada: quem recebeu, quem abriu, quem respondeu. */
function Acompanhamento({
  roundId,
  roundStatus,
  companyName,
  roundTitle,
  items,
  groups,
  groupName,
  roundSuppliers,
  contatos,
  supplierGroups,
  latestReminders,
  selectableSuppliers,
  podeEditar,
  podeEnviar,
  whatsappReady,
  invitationTemplate,
  podeFechar,
  podeCancelarGrupo,
  encerrada,
}: {
  roundId: string;
  roundStatus: string;
  companyName: string;
  roundTitle: string;
  items: Item[];
  groups: Grupo[];
  groupName: Map<string, string>;
  roundSuppliers: RoundSupplier[];
  contatos: Contatos;
  supplierGroups: Map<string, string[]>;
  latestReminders: Map<string, string>;
  selectableSuppliers: DadosDaRodada["selectableSuppliers"];
  podeEditar: boolean;
  podeEnviar: boolean;
  whatsappReady: boolean;
  invitationTemplate: string;
  podeFechar: boolean;
  podeCancelarGrupo: boolean;
  encerrada: boolean;
}) {
  return (
    <>
      {/* Indicadores e pendências primeiro: é a leitura de "em que pé estamos"
          antes das listas do "o que tem dentro". Fronteira própria porque são
          números — chegar depois deles não pode segurar o resto da tela. */}
      <Suspense fallback={<MetricsSkeleton />}>
        <IndicadoresDaRodada
          roundId={roundId}
          status={roundStatus}
          fornecedores={roundSuppliers.map((rs) => ({
            supplierId: rs.supplier_id,
            nome: rs.suppliers?.name ?? "Fornecedor",
          }))}
        />
      </Suspense>

      {/* Os grupos só ganham uma seção própria depois que a rodada anda: é aí
          que eles passam a poder discordar entre si — um fechado, outro ainda
          esperando preço. Em preparação são todos iguais e ficam recolhidos
          dentro do passo de produtos. */}
      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Grupos</h2>
        <p className="text-fg-muted mb-3 text-sm">
          Cada grupo anda por conta própria. Fechar um encerra os itens dele sem
          compra e o tira do link dos fornecedores; os outros continuam.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          {groups.map((group) => {
            const doGrupo = items.filter((i) => i.group_id === group.id);
            return (
              <GroupChip
                key={group.id}
                roundId={roundId}
                groupId={group.id}
                name={group.name}
                itemCount={doGrupo.length}
                openItemCount={
                  doGrupo.filter((i) => i.commercial_status === "open").length
                }
                status={group.status}
                editable={false}
                closable={podeFechar && group.status === "open"}
                cancellable={podeCancelarGrupo && group.status === "open"}
              />
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-fg mb-1 text-sm font-semibold">Itens</h2>
        <p className="text-fg-muted mb-3 text-sm">
          O que está sendo cotado, com a quantidade que você pretende comprar.
        </p>

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
              <QuotationItemRow
                key={item.id}
                roundId={roundId}
                itemId={item.id}
                productName={item.products?.name ?? "Produto"}
                groupId={item.group_id}
                groupName={groupName.get(item.group_id) ?? "—"}
                quantity={Number(item.requested_quantity)}
                purchaseUnit={item.purchase_unit?.symbol ?? ""}
                pricingUnit={item.pricing_unit?.symbol ?? ""}
                commercialStatus={item.commercial_status}
                editable={false}
                groups={groups}
              />
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="text-fg mb-1 text-sm font-semibold">
          Fornecedores convidados
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Cada um recebe um link próprio, com os itens organizados por grupo.
          Gere o link, mande pelo seu canal e registre o envio.
        </p>

        {podeEditar && !encerrada ? (
          <SupplierGroupManager
            roundId={roundId}
            groups={groups.map((group) => ({
              ...group,
              itemCount: items.filter(
                (item) =>
                  item.group_id === group.id &&
                  item.commercial_status !== "cancelled",
              ).length,
            }))}
            participants={roundSuppliers.map((rs) => ({
              roundSupplierId: rs.id,
              supplierId: rs.supplier_id,
              name: rs.suppliers?.name ?? "Fornecedor",
              contactId: rs.supplier_contact_id,
              contacts: contatos.get(rs.supplier_id) ?? [],
              groupIds: supplierGroups.get(rs.id) ?? [],
              firstSentAt: rs.first_sent_at,
            }))}
            suppliers={selectableSuppliers}
          />
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Grupos</TableHead>
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
                      roundId={roundId}
                      roundSupplierId={rs.id}
                      contactId={rs.supplier_contact_id}
                      contacts={contatos.get(rs.supplier_id) ?? []}
                    />
                  ) : null}
                </TableCell>
                <TableCell className="text-fg-muted text-xs">
                  {(supplierGroups.get(rs.id) ?? [])
                    .map((groupId) => groupName.get(groupId))
                    .filter(Boolean)
                    .join(", ") || "nenhum"}
                </TableCell>
                <TableCell className="text-fg-muted text-xs">
                  {rs.first_sent_at
                    ? DATA_HORA.format(new Date(rs.first_sent_at))
                    : "ainda não"}
                  {latestReminders.get(rs.id) ? (
                    <span className="text-fg-subtle mt-0.5 block">
                      Cobrado {DATA_HORA.format(new Date(latestReminders.get(rs.id)!))}
                    </span>
                  ) : null}
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
                    const totalAtribuidos =
                      rs.supplier_quotation_items?.filter(
                        (item) => item.removed_at === null,
                      ).length ?? 0;
                    if (respondidos === 0) {
                      return <span className="text-fg-subtle">—</span>;
                    }
                    return (
                      <>
                        <Badge
                          variant={rs.completed_at ? "default" : "secondary"}
                        >
                          {respondidos} de {totalAtribuidos}
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
                      roundId={roundId}
                      supplierName={rs.suppliers?.name ?? "fornecedor"}
                      alreadySent={rs.first_sent_at !== null}
                      groupSummary={(supplierGroups.get(rs.id) ?? [])
                        .map((groupId) => groupName.get(groupId))
                        .filter((name): name is string => Boolean(name))}
                      itemCount={
                        rs.supplier_quotation_items?.filter(
                          (item) => item.removed_at === null,
                        ).length ?? 0
                      }
                      contactName={rs.supplier_contacts?.name ?? null}
                      contactWhatsapp={rs.supplier_contacts?.whatsapp ?? null}
                      whatsappReady={whatsappReady}
                      companyName={companyName}
                      roundTitle={roundTitle}
                      invitationTemplate={invitationTemplate}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

/**
 * O caminho barrado, com a saída.
 *
 * "Nenhum fornecedor ativo com contato" era um pedaço de frase dentro do estado
 * vazio, e quem lesse não sabia que faltava era o CONTATO, nem para onde ir. O
 * aviso diz o que falta, por que aquilo é exigido, e leva ao lugar de resolver.
 */
function Aviso({
  icone: Icone,
  titulo,
  texto,
  acao,
}: {
  icone: typeof Package;
  titulo: string;
  texto: string;
  acao: { href: string; label: string };
}) {
  return (
    <div className="border-border bg-surface-sunken mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
      <Icone className="text-fg-subtle size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">{titulo}</p>
        <p className="text-fg-muted text-sm">{texto}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href={acao.href}>
          {acao.label} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
