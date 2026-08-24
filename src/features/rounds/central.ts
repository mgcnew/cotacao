import "server-only";

import { cache } from "react";

import { listProducts } from "@/features/products/queries";
import { listPendingShoppingItems } from "@/features/shopping-list/queries";
import {
  getRound,
  listRoundGroups,
  listRoundItems,
  listRoundSupplierContacts,
  listRoundSupplierGroups,
  listRoundSuppliers,
  listSelectableSuppliers,
} from "@/features/rounds/queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

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

export const carregarRodada = cache(async (roundId: string) => {
  const company = await requireActiveCompany();

  const [round, groups, items, roundSuppliers, permissions] = await Promise.all([
    carregarRodadaBasica(roundId),
    listRoundGroups(company.companyId, roundId),
    listRoundItems(company.companyId, roundId),
    listRoundSuppliers(company.companyId, roundId),
    getPermissions(company.companyId),
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

  const [products, shoppingItems, selectableSuppliers, contatos, supplierGroups] =
    await Promise.all([
      podeMontar ? listProducts(company.companyId) : Promise.resolve([]),
      podeMontar
        ? listPendingShoppingItems(company.companyId)
        : Promise.resolve([]),
      podeEditar && !encerrada
        ? listSelectableSuppliers(company.companyId)
        : Promise.resolve([]),
      // Só há o que trocar quando o fornecedor tem mais de um contato ativo; a
      // consulta é uma para a tabela toda, não uma por linha.
      podeEditar && !encerrada
        ? listRoundSupplierContacts(
            company.companyId,
            roundSuppliers.map((rs) => rs.supplier_id),
          )
        : Promise.resolve(new Map()),
      listRoundSupplierGroups(
        company.companyId,
        roundSuppliers.map((rs) => rs.id),
      ),
    ]);

  const itensAtivos = items.filter((i) => i.commercial_status !== "cancelled");
  const itensEmAberto = items.filter((i) => i.commercial_status === "open");
  const gruposAbertos = groups.filter((g) => g.status === "open");

  return {
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
    selectableSuppliers,
    contatos,
    supplierGroups,
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
  };
});

export type DadosDaRodada = NonNullable<
  Awaited<ReturnType<typeof carregarRodada>>
>;
