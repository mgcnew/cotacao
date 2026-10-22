/**
 * "Chegou conforme pedido": a quantidade de precificação que dá para saber sem
 * ninguém digitar.
 *
 * Dar baixa de um pedido que chegou inteiro, sem nota em mãos, pede duas
 * quantidades por item: a física (na unidade de compra) e a de precificação
 * (na unidade em que o preço é combinado). Quando as unidades são iguais, as
 * duas são a mesma coisa. Quando diferem — caixa comprada, quilo cobrado —, só
 * há resposta se o pedido guardou uma estimativa, e ela vale para a quantidade
 * pedida inteira; para o saldo, entra proporcional.
 *
 * `null` é a resposta honesta quando não dá: o pedido precisa da conferência
 * normal, onde alguém pesa ou lê a nota. Chutar aqui contaminaria o valor total.
 */
export function quickPricingQuantity(item: {
  sameUnit: boolean;
  requestedQuantity: number;
  pendingQuantity: number;
  estimatedPricingQuantity: number | null;
}): number | null {
  if (item.pendingQuantity <= 0) return 0;
  if (item.sameUnit) return item.pendingQuantity;
  if (
    item.estimatedPricingQuantity === null ||
    !(item.estimatedPricingQuantity > 0) ||
    !(item.requestedQuantity > 0)
  ) {
    return null;
  }
  return (
    (item.estimatedPricingQuantity * item.pendingQuantity) /
    item.requestedQuantity
  );
}

/** Todos os itens com saldo têm resposta, e há ao menos um com saldo. */
export function canReceiveAsOrdered(
  items: {
    sameUnit: boolean;
    requestedQuantity: number;
    pendingQuantity: number;
    estimatedPricingQuantity: number | null;
  }[],
): boolean {
  const pending = items.filter((item) => item.pendingQuantity > 0);
  return (
    pending.length > 0 &&
    pending.every((item) => quickPricingQuantity(item) !== null)
  );
}
