import "server-only";

import { cache } from "react";

import { getRoundComparison } from "@/features/quotations/comparison";
import { carregarRodadaBasica } from "@/features/rounds/central";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

/**
 * A comparação de respostas, para a página inteira e para o modal.
 *
 * Mesma razão de ser do `central.ts`: a comparação agora é desenhada em dois
 * lugares — `/compras/[id]/comparacao` e a mesma URL interceptada por cima da
 * lista. Duas consultas da mesma verdade envelheceriam em ritmos diferentes.
 *
 * O `cache()` reaproveita `carregarRodadaBasica`, que o cabeçalho do modal já
 * pediu: dentro de uma renderização, o título e esta tela dividem a leitura da
 * rodada em vez de fazerem duas.
 */
export const carregarComparacao = cache(async (roundId: string) => {
  const company = await requireActiveCompany();

  const [round, comparison, permissions] = await Promise.all([
    carregarRodadaBasica(roundId),
    getRoundComparison(company.companyId, roundId),
    getPermissions(company.companyId),
  ]);

  if (!round) return null;

  return {
    round,
    rows: comparison.rows,
    suppliers: comparison.suppliers,
    podeNegociar: permissions.has("negotiation.create"),
    podeCorrigir: permissions.has("quotation_response.correct"),
  };
});

export type DadosDaComparacao = NonNullable<
  Awaited<ReturnType<typeof carregarComparacao>>
>;
