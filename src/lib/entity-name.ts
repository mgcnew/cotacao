/** Mesma normalização usada pela trava da migration 0044. */
export function normalizeEntityName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
