import "server-only";

import { cache } from "react";

import { listActiveProductNames } from "@/features/products/queries";
import { listPendingShoppingItems } from "@/features/shopping-list/queries";
import {
  getRound,
  listLatestRoundRemindersByRound,
  listRoundGroups,
  listRoundItems,
  listRoundSupplierContacts,
  listRoundSupplierGroupsByRound,
  listRoundSuppliers,
  listSelectableSuppliers,
} from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";
import { getWhatsAppConnection } from "@/features/whatsapp/queries";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/features/whatsapp/message-templates";
import { getCompanyWhatsAppTemplates } from "@/features/whatsapp/templates";

/**
 * Tudo o que a Central da Rodada precisa saber, em um lugar só.
 *
 * POR QUE ISTO SAIU DA PÁGINA
 *
 * A mesma rodada agora é desenhada em dois lugares: a página inteira, em
 * `/compras/[id]`, e o modal que se abre por cima da lista. Se cada um fizesse
 * as próprias consultas, seriam duas leituras da mesma verdade, com o risco de
 * sempre — a segunda envelhece e ninguém percebe.
 *
 * O `cache()` do React é o que torna isto barato: dentro de uma renderização,
 * chamar `carregarRodada` três vezes é uma ida só ao banco. É o que permite ao
 * modal pedir o título cedo, para o cabeçalho, e o resto depois, sem pagar
 * duas vezes.
 */

/** Só o cabeçalho: uma leitura, para o modal ter nome antes do resto chegar. */
export const carregarRodadaBasica = cache(async (roundId: string) => {
  const company = await requireActiveCompany();
  return getRound(company.companyId, roundId);
});

/**
 * O que cada aba da rodada precisa — e só isso.
 *
 * As três abas "de dados" (Respostas, Distribuição, Produtos e grupos) eram a
 * mesma página com `?view=`, e todas rodavam o carregamento inteiro: cerca de
 * treze consultas, em três ondas em série, para desenhar uma tela que usa
 * duas ou três delas. Cada troca de aba pagava as treze.
 *
 *   respostas     fornecedores, grupos, cobranças, WhatsApp
 *   distribuicao  fornecedores, grupos, itens, contatos, fornecedores a convidar
 *   escopo        grupos, itens
 *   resumo        o que o cabeçalho conta (itens, grupos, fornecedores)
 *   tudo          a montagem (rascunho) e quem não sabe qual aba é
 *
 * O formato devolvido é o mesmo em todos: o que o escopo não pede vem vazio, e
 * uma rodada em rascunho sempre volta como `tudo` — a montagem usa de tudo.
 */
export type EscopoDaRodada =
  "tudo" | "resumo" | "respostas" | "distribuicao" | "escopo";

const precisaDeItens = (e: EscopoDaRodada) => e !== "respostas";
const precisaDoWhatsApp = (e: EscopoDaRodada) =>
  e === "tudo" || e === "respostas";
const precisaDosGruposDosFornecedores = (e: EscopoDaRodada) =>
  e === "tudo" || e === "respostas" || e === "distribuicao";
const precisaDasCobrancas = (e: EscopoDaRodada) =>
  e === "tudo" || e === "respostas";
const precisaDaDistribuicao = (e: EscopoDaRodada) =>
  e === "tudo" || e === "distribuicao";

// Cada leitura memoizada por argumentos: o cabeçalho (`resumo`) e a aba pedem
// grupos e fornecedores da mesma rodada na mesma renderização, e não devem
// custar duas idas ao banco.
const gruposDaRodada = cache((companyId: string, roundId: string) =>
  listRoundGroups(companyId, roundId),
);
const itensDaRodada = cache((companyId: string, roundId: string) =>
  listRoundItems(companyId, roundId),
);
const fornecedoresDaRodada = cache((companyId: string, roundId: string) =>
  listRoundSuppliers(companyId, roundId),
);

async function montarRodada(roundId: string, escopo: EscopoDaRodada) {
  const company = await requireActiveCompany();
  // As permissões já vieram na sessão que acabou de ser lida: não é uma ida a
  // mais, e saber `podeEditar` agora deixa a leitura dos fornecedores a convidar
  // sair junto com as demais, em vez de esperar a rodada.
  const permissions = await getPermissions(company.companyId);
  const querEditar = permissions.has("purchase_round.update");

  const [
    round,
    groups,
    items,
    roundSuppliers,
    whatsappConnection,
    whatsappTemplates,
    supplierGroups,
    latestReminders,
    selectableSuppliers,
  ] = await Promise.all([
    carregarRodadaBasica(roundId),
    gruposDaRodada(company.companyId, roundId),
    precisaDeItens(escopo)
      ? itensDaRodada(company.companyId, roundId)
      : Promise.resolve([] as Awaited<ReturnType<typeof listRoundItems>>),
    fornecedoresDaRodada(company.companyId, roundId),
    precisaDoWhatsApp(escopo)
      ? getWhatsAppConnection(company.companyId)
      : Promise.resolve(null),
    precisaDoWhatsApp(escopo)
      ? getCompanyWhatsAppTemplates(company.companyId)
      : Promise.resolve({ ...DEFAULT_WHATSAPP_TEMPLATES }),
    precisaDosGruposDosFornecedores(escopo)
      ? listRoundSupplierGroupsByRound(company.companyId, roundId)
      : Promise.resolve(new Map<string, string[]>()),
    precisaDasCobrancas(escopo)
      ? listLatestRoundRemindersByRound(company.companyId, roundId)
      : Promise.resolve(new Map<string, string>()),
    // Especulativa: sai junto com o resto, e se a rodada estiver encerrada o
    // resultado é descartado logo abaixo. Esperar o status custaria uma onda.
    precisaDaDistribuicao(escopo) && querEditar
      ? listSelectableSuppliers(company.companyId)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listSelectableSuppliers>>,
        ),
  ]);

  if (!round) return null;

  const podeEditar = permissions.has("purchase_round.update");
  const podeEnviar = permissions.has("purchase_round.send");
  const podeFechar = permissions.has("purchase_round.close");
  const podeCancelar = permissions.has("purchase_round.cancel");

  const emPreparacao = round.status === "draft";
  const emAndamento = round.status === "active";
  const encerrada =
    round.status === "completed" || round.status === "cancelled";
  // Depois de iniciada, a rodada só muda por atualização controlada — isso é
  // etapa seguinte, com token e reenvio. Aqui a montagem se encerra.
  const podeMontar = podeEditar && emPreparacao;

  const [products, shoppingItems, contatos] = await Promise.all([
    podeMontar
      ? listActiveProductNames(company.companyId)
      : Promise.resolve([]),
    podeMontar
      ? listPendingShoppingItems(company.companyId)
      : Promise.resolve([]),
    // Só há o que trocar quando o fornecedor tem mais de um contato ativo; a
    // consulta é uma para a tabela toda, não uma por linha. Precisa dos
    // fornecedores da rodada, por isso espera por eles — e só a distribuição a
    // usa.
    querEditar && !encerrada && precisaDaDistribuicao(escopo)
      ? listRoundSupplierContacts(
          company.companyId,
          roundSuppliers.map((rs) => rs.supplier_id),
        )
      : Promise.resolve(new Map()),
  ]);

  const itensAtivos = items.filter((i) => i.commercial_status !== "cancelled");
  const itensEmAberto = items.filter((i) => i.commercial_status === "open");
  const gruposAbertos = groups.filter((g) => g.status === "open");

  return {
    companyName: company.companyName,
    round,
    groups: groups.map((g) => ({ id: g.id, name: g.name, status: g.status })),
    groupName: new Map(groups.map((g) => [g.id, g.name])),
    items,
    itensAtivos,
    itensEmAberto,
    gruposAbertos,
    roundSuppliers,
    products,
    shoppingItems,
    selectableSuppliers: querEditar && !encerrada ? selectableSuppliers : [],
    contatos,
    supplierGroups,
    latestReminders,
    podeEditar,
    podeEnviar,
    podeMontar,
    podeFechar,
    podeCancelar,
    emPreparacao,
    emAndamento,
    encerrada,
    // "Parcialmente fechada" é condição, não estado — o CHECK de
    // `purchase_rounds` só conhece quatro, e a seção 16.1 do documento mestre
    // lista a quinta entre os estados. Ela é calculada: rodada andando com pelo
    // menos um grupo já encerrado e pelo menos um ainda de pé.
    parcialmenteFechada:
      emAndamento &&
      gruposAbertos.length > 0 &&
      groups.some((g) => g.status === "closed" || g.status === "cancelled"),
    whatsappReady: whatsappConnection?.status === "connected",
    whatsappTemplates,
  };
}

/**
 * Lê a rodada para o escopo pedido.
 *
 * Uma rodada em RASCUNHO é a montagem, que usa de tudo: nela o escopo parcial
 * não serve, e só ela paga a releitura completa. Fica aqui, e não dentro de
 * `montarRodada`, porque uma função que se chama a si mesma não tem tipo
 * inferível — e `DadosDaRodada` sai deste retorno.
 */
export const carregarRodada = cache(
  async (roundId: string, escopo: EscopoDaRodada = "tudo") => {
    const dados = await montarRodada(roundId, escopo);
    if (dados && escopo !== "tudo" && dados.emPreparacao) {
      return montarRodada(roundId, "tudo");
    }
    return dados;
  },
);

/**
 * Quantos grupos da rodada ainda estão abertos — o que concluir a rodada fecha
 * junto. Só a contagem, para a Decisão oferecer "Concluir" sem carregar a Central.
 */
export const contarGruposAbertos = cache(async (roundId: string) => {
  const company = await requireActiveCompany();
  const groups = await gruposDaRodada(company.companyId, roundId);
  return groups.filter((g) => g.status === "open").length;
});

export type DadosDaRodada = NonNullable<
  Awaited<ReturnType<typeof carregarRodada>>
>;
