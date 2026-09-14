const CENTS = 100;

/** Valores financeiros do sistema são decididos em centavos de real. */
export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * CENTS) / CENTS;
}

export function sameMoney(left: number, right: number) {
  return roundMoney(left) === roundMoney(right);
}

/** Recebe um decimal já normalizado com ponto e preserva o envio como texto. */
export function roundedMoneyString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed).toFixed(2) : value;
}

/**
 * Preço unitário como ele aparece na tela: centavos.
 *
 * A comparação continua no número cheio — quem ordena, escolhe o vencedor e
 * fecha o pedido nunca lê este texto. Só a leitura arredonda, porque R$ 0,084
 * não se parece com dinheiro para quem está respondendo a cotação no celular.
 *
 * A exceção é o valor que sumiria: abaixo de meio centavo o arredondamento
 * escreveria "R$ 0,00" para algo que custa, então ali as casas voltam.
 */
const UNIT_PRICE_CENTS = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const UNIT_PRICE_TINY = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatUnitPrice(value: number) {
  if (!Number.isFinite(value)) return UNIT_PRICE_CENTS.format(value);
  return value !== 0 && roundMoney(value) === 0
    ? UNIT_PRICE_TINY.format(value)
    : UNIT_PRICE_CENTS.format(value);
}
