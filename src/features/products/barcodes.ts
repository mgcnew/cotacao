/**
 * Leitores costumam acrescentar espaços ou quebras; códigos internos podem ter
 * letras e hífen. Mantemos estes últimos e normalizamos caixa/espaçamento para
 * a mesma etiqueta nunca nascer duas vezes com grafias diferentes.
 */
export function normalizeBarcode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

/** UPC-A às vezes chega da câmera como EAN-13 com um zero à esquerda. */
export function barcodeCandidates(value: string): Set<string> {
  const code = normalizeBarcode(value);
  const candidates = new Set([code]);
  if (/^0\d{12}$/.test(code)) candidates.add(code.slice(1));
  if (/^\d{12}$/.test(code)) candidates.add(`0${code}`);
  return candidates;
}

export function barcodeMatches(registeredCodes: string[], scannedCode: string) {
  return findMatchingBarcode(registeredCodes, scannedCode) !== null;
}

/** Devolve a grafia cadastrada, que é a que o leitor externo deve receber. */
export function findMatchingBarcode(registeredCodes: string[], scannedCode: string) {
  const scanned = normalizeBarcode(scannedCode);
  const exact = registeredCodes.find((code) => normalizeBarcode(code) === scanned);
  if (exact) return normalizeBarcode(exact);
  const candidates = barcodeCandidates(scanned);
  const equivalent = registeredCodes.find((code) => candidates.has(normalizeBarcode(code)));
  return equivalent ? normalizeBarcode(equivalent) : null;
}
