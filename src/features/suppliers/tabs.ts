/**
 * As áreas do fornecedor.
 *
 * Quatro delas vivem em `/fornecedores/<id>?aba=`, e o histórico comercial tem
 * rota própria — é a mesma divisão da Central da Rodada, onde a decisão também
 * é um segmento à parte. O motivo é prático: cada aba carrega só as suas
 * consultas, então abrir o cadastro não paga o catálogo inteiro que só o
 * modelo de compra usa.
 */
export const SUPPLIER_TABS = [
  "cadastro",
  "contatos",
  "agenda",
  "avisos",
] as const;

export type SupplierTab = (typeof SUPPLIER_TABS)[number];

export function parseSupplierTab(
  params: Record<string, string | string[] | undefined>,
): SupplierTab {
  const raw = Array.isArray(params.aba) ? params.aba[0] : params.aba;
  return SUPPLIER_TABS.includes(raw as SupplierTab)
    ? (raw as SupplierTab)
    : "cadastro";
}
