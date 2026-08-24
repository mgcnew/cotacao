/**
 * Leitores costumam acrescentar espaços ou quebras; códigos internos podem ter
 * letras e hífen. Mantemos estes últimos e normalizamos caixa/espaçamento para
 * a mesma etiqueta nunca nascer duas vezes com grafias diferentes.
 */
export function normalizeBarcode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}
