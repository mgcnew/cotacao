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
