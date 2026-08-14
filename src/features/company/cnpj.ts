/** Só os dígitos: é assim que o CNPJ é persistido. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** 63195471000112 → 63.195.471/0001-12 */
export function formatCnpj(value: string | null | undefined): string {
  if (!value) return "—";
  const d = onlyDigits(value);
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function checkDigit(base: string, weights: number[]): number {
  const sum = base
    .split("")
    .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Valida CNPJ pelos dois dígitos verificadores.
 * Rejeita também sequências repetidas (00000000000000 e afins), que passam
 * no cálculo mas não existem na Receita.
 */
export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const first = checkDigit(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(d[12])) return false;

  const second = checkDigit(
    d.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return second === Number(d[13]);
}
