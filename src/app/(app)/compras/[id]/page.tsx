import { ArrowRight, Package, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclosure } from "@/components/layout/disclosure";
import { PageHeader } from "@/components/layout/page-header";
import {
  ContactPicker,
  EditRoundForm,
  GroupChip,
  QuotationItemRow,
} from "@/components/rounds/round-crud-forms";
import {
  GroupForm,
  ItemForm,
  StartRoundPanel,
  SupplierPickerForm,
} from "@/components/rounds/round-forms";
import { RoundSteps } from "@/components/rounds/round-steps";
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
import { GRUPO_PADRAO } from "@/features/rounds/groups";
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

/**
 * A Central da Rodada tem duas vidas, e agora elas são duas telas.
 *
 * EM PREPARAÇÃO ela é uma montagem: produtos, fornecedores, iniciar. Nessa
 * fase, colunas como "enviado", "abriu o link" e "respondeu" só podem estar
 * vazias — nada foi enviado —, e "comparar respostas" leva a uma tela em
 * branco. Mostrar tudo isso era encher a tela de perguntas sem resposta e
 * deixar quem chegou hoje sem saber por onde começar.
 *
 * DEPOIS DE INICIADA ela é acompanhamento: quem recebeu, quem abriu, quem
 * respondeu — e é aí que aquelas colunas passam a valer. O layout antigo é este
 * segundo caso, preservado.
 */
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
  const itensAtivos = items.filter((i) => i.commercial_status !== "cancelled");

  return (
    <div className="w-full">
      <PageHeader
        title={round.title}
        description={
          emPreparacao
            ? "Em preparação: monte a cotação aqui e nada sai daqui até você iniciá-la."
            : `${itensAtivos.length} itens · ${groups.length} grupos · ${roundSuppliers.length} fornecedores`
        }
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
            {/* Antes de iniciar não há resposta para comparar nem compra para
                decidir: os dois botões levavam a telas vazias. */}
            {emPreparacao ? null : (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/compras/${id}/comparacao`}>
                    Comparar respostas
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/compras/${id}/alocacao`}>Decidir compra</Link>
                </Button>
              </>
            )}
            <Badge variant={roundStatusTone(round.status)}>
              {ROUND_STATUS_LABEL[round.status] ?? round.status}
            </Badge>
          </>
        }
      />

      {round.notes ? (
        <p className="text-fg-muted border-border bg-surface-sunken mb-6 rounded-xl border px-4 py-3 text-sm">
          {round.notes}
        </p>
      ) : null}

      {emPreparacao ? (
        <Montagem
          roundId={id}
          podeMontar={podeMontar}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          groupName={groupName}
          items={items}
          itensAtivos={itensAtivos.length}
          products={products}
          roundSuppliers={roundSuppliers}
          selectableSuppliers={selectableSuppliers}
          contatos={contatos}
          podeEditar={podeEditar}
        />
      ) : (
        <Acompanhamento
          roundId={id}
          items={items}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          groupName={groupName}
          roundSuppliers={roundSuppliers}
          contatos={contatos}
          podeEditar={podeEditar}
          podeEnviar={podeEnviar}
          encerrada={encerrada}
          totalItens={itensAtivos.length}
        />
      )}
    </div>
  );
}

/**
 * Os tipos vêm das próprias consultas.
 *
 * Escrever a forma da linha à mão aqui seria copiar o `select` do PostgREST
 * para um segundo lugar — e um `select` que ganha uma coluna deixa a cópia
 * mentindo sem que nada quebre.
 */
type Grupo = { id: string; name: string };
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
  roundSuppliers: RoundSupplier[];
  selectableSuppliers: { id: string; name: string }[];
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
            titulo: "Produtos",
            resumo: temItens
              ? `${itensAtivos} ${itensAtivos === 1 ? "produto" : "produtos"}`
              : "nenhum ainda",
            estado: temItens ? "feito" : "agora",
            ancora: "passo-produtos",
          },
          {
            titulo: "Fornecedores",
            resumo: temFornecedores
              ? `${roundSuppliers.length} ${roundSuppliers.length === 1 ? "convidado" : "convidados"}`
              : "nenhum ainda",
            estado: temFornecedores
              ? "feito"
              : temItens
                ? "agora"
                : "depois",
            ancora: "passo-fornecedores",
          },
          {
            titulo: "Conferir e iniciar",
            resumo: pronto ? "tudo pronto" : "depois dos dois acima",
            estado: pronto ? "agora" : "depois",
            ancora: "passo-iniciar",
          },
        ]}
      />

      <section id="passo-produtos" className="mb-10 scroll-mt-4">
        <h2 className="text-fg mb-1 text-base font-semibold">1 · Produtos</h2>
        <p className="text-fg-muted mb-4 text-sm">
          O que você quer cotar, e quanto pretende comprar de cada. É esta lista
          que cada fornecedor vai receber para preencher com o preço dele.
        </p>

        {podeMontar && produtosAtivos.length === 0 ? (
          <Aviso
            icone={Package}
            titulo="Nenhum produto no catálogo ainda"
            texto="A rodada cota produtos cadastrados — é o cadastro que guarda as unidades de compra e de preço, sem as quais não há como comparar propostas."
            acao={{ href: "/produtos/novo", label: "Cadastrar produto" }}
          />
        ) : null}

        {podeMontar && produtosAtivos.length > 0 ? (
          <div className="mb-4">
            <ItemForm
              roundId={roundId}
              groups={groups}
              products={produtosAtivos.map((p) => ({
                id: p.id,
                name: p.name,
              }))}
            />
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
                  removed={item.commercial_status === "cancelled"}
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
                  O grupo organiza a cotação por dentro: o fornecedor continua
                  recebendo um link só, com os itens separados por seção. É
                  diferente da categoria do produto, que é do catálogo.
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
                        items.filter((i) => i.group_id === group.id).length
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

      <section id="passo-fornecedores" className="mb-10 scroll-mt-4">
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
            acao={{ href: "/fornecedores/novo", label: "Cadastrar fornecedor" }}
          />
        ) : null}

        {podeMontar && disponiveis.length > 0 ? (
          <div className="mb-4">
            <SupplierPickerForm roundId={roundId} suppliers={disponiveis} />
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

      <section id="passo-iniciar" className="scroll-mt-4">
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
    </>
  );
}

/** A rodada já iniciada: quem recebeu, quem abriu, quem respondeu. */
function Acompanhamento({
  roundId,
  items,
  groups,
  groupName,
  roundSuppliers,
  contatos,
  podeEditar,
  podeEnviar,
  encerrada,
  totalItens,
}: {
  roundId: string;
  items: Item[];
  groups: Grupo[];
  groupName: Map<string, string>;
  roundSuppliers: RoundSupplier[];
  contatos: Contatos;
  podeEditar: boolean;
  podeEnviar: boolean;
  encerrada: boolean;
  totalItens: number;
}) {
  return (
    <>
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
                removed={item.commercial_status === "cancelled"}
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
                      roundId={roundId}
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
                          {respondidos} de {totalItens}
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
