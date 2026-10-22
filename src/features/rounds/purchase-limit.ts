/**
 * O total que um fornecedor vai receber contra o limite de compras do cadastro.
 *
 * Cada fornecedor da decisão vira um pedido, então o total da proposta dele é o
 * valor do pedido. O limite é um aviso, não uma trava: quem decide é a pessoa,
 * e passar do limite pode ser justo (um item combinado, um fornecedor que
 * ganhou todos). O que não pode é passar sem saber — e hoje o cadastro guarda o
 * número e a decisão nunca o consulta.
 *
 * Sem limite cadastrado, ou com total ainda não calculável, não há o que dizer.
 */

/** A partir daqui o aviso diz "perto do limite". */
export const LIMITE_PERTO = 0.9;

export type SituacaoDoLimite =
  | { tipo: "acima"; limite: number; excesso: number }
  | { tipo: "perto"; limite: number; uso: number };

export function situacaoDoLimite(
  total: number,
  limite: number | null | undefined,
): SituacaoDoLimite | null {
  if (!limite || !(limite > 0) || !(total > 0)) return null;
  if (total > limite) return { tipo: "acima", limite, excesso: total - limite };
  const uso = total / limite;
  return uso >= LIMITE_PERTO ? { tipo: "perto", limite, uso } : null;
}
