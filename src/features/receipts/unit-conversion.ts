import { normalizedNfeUnit } from "@/features/receipts/nfe";

export type FixedConversionEntry =
  "source_to_target" | "target_to_source" | "invoice_total";

const WEIGHT_UNITS = new Set(["KG", "KGM", "G", "GR"]);

export function isWeightNfeUnit(unit: string | null | undefined) {
  return WEIGHT_UNITS.has(normalizedNfeUnit(unit));
}

export function preferredFixedConversionEntry(
  sourceUnit: string,
  targetUnit: string,
): FixedConversionEntry {
  return isWeightNfeUnit(sourceUnit) && !isWeightNfeUnit(targetUnit)
    ? "target_to_source"
    : "source_to_target";
}

/**
 * Todas as formas amigáveis viram o fator canônico persistido pelo banco:
 * quantidade de destino = quantidade da NF-e × fator.
 */
export function canonicalConversionFactor({
  entry,
  value,
  sourceQuantity,
}: {
  entry: FixedConversionEntry;
  value: number | null;
  sourceQuantity: number | null;
}) {
  if (value === null || value <= 0) return null;
  if (entry === "source_to_target") return value;
  if (entry === "target_to_source") return 1 / value;
  if (sourceQuantity === null || sourceQuantity <= 0) return null;
  return value / sourceQuantity;
}

export function entryValueFromCanonicalFactor({
  entry,
  factor,
  sourceQuantity,
}: {
  entry: FixedConversionEntry;
  factor: number | null;
  sourceQuantity: number | null;
}) {
  if (factor === null || factor <= 0) return null;
  if (entry === "source_to_target") return factor;
  if (entry === "target_to_source") return 1 / factor;
  if (sourceQuantity === null || sourceQuantity <= 0) return null;
  return sourceQuantity * factor;
}
