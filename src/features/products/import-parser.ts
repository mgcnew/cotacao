import "server-only";

import * as XLSX from "xlsx";

import { normalizeBarcode } from "@/features/products/barcodes";
import { normalizeEntityName } from "@/lib/entity-name";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;

export type ParsedProductImportRow = {
  sourceRow: number;
  sourceCode: string | null;
  rawName: string;
  proposedName: string;
  rawBarcode: string | null;
  barcode: string | null;
  sourceCategory: string;
  issues: string[];
};

export type ParsedProductImport = {
  sheetName: string;
  rows: ParsedProductImportRow[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedHeader(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function suggestedName(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || compact !== compact.toLocaleUpperCase("pt-BR"))
    return compact;
  const lower = compact.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/** Validação de GTIN-8/UPC/GTIN-13/GTIN-14 pelo dígito verificador. */
export function isValidGtin(value: string) {
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length))
    return false;
  const digits = [...value].map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reduce((total, digit, index) => {
    const distanceFromRight = digits.length - index;
    return total + digit * (distanceFromRight % 2 === 1 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export async function parseProductSpreadsheet(
  file: File,
): Promise<ParsedProductImport> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) {
    throw new Error("Envie uma planilha .xlsx ou .csv.");
  }
  if (file.size === 0) throw new Error("A planilha está vazia.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("A planilha deve ter no máximo 4 MB.");

  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha não possui nenhuma aba.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (matrix.length < 2)
    throw new Error("A planilha precisa ter cabeçalho e ao menos um produto.");

  const headers = matrix[0].map(normalizedHeader);
  const nameIndex = findColumn(headers, [
    "descricao",
    "nome",
    "produto",
    "nome do produto",
  ]);
  const barcodeIndex = findColumn(headers, [
    "ean",
    "gtin",
    "codigo de barras",
    "cod barras",
    "barcode",
  ]);
  const codeIndex = findColumn(headers, [
    "codigo",
    "cod",
    "sku",
    "codigo interno",
  ]);
  const categoryIndex = findColumn(headers, [
    "secao",
    "categoria",
    "departamento",
    "grupo",
  ]);

  if (nameIndex < 0) {
    throw new Error(
      `Não encontrei a coluna de produto. Cabeçalhos lidos: ${matrix[0].map(text).filter(Boolean).join(", ")}.`,
    );
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new Error(
      `A planilha possui mais de ${MAX_ROWS.toLocaleString("pt-BR")} linhas. Divida-a em mais de um arquivo.`,
    );
  }

  const rows: ParsedProductImportRow[] = [];
  for (const [index, cells] of dataRows.entries()) {
    const rawName = text(cells[nameIndex]).replace(/\s+/g, " ");
    if (!rawName) continue;
    const rawBarcode = barcodeIndex >= 0 ? text(cells[barcodeIndex]) : "";
    const barcode = rawBarcode ? normalizeBarcode(rawBarcode) : null;
    const proposed = suggestedName(rawName);
    const issues: string[] = [];
    if (proposed.length < 2) issues.push("invalid_name");
    if (proposed.length > 120) issues.push("name_too_long");
    if (barcode && /^\d+$/.test(barcode) && !isValidGtin(barcode)) {
      issues.push("invalid_barcode");
    }

    rows.push({
      sourceRow: index + 2,
      sourceCode: codeIndex >= 0 ? text(cells[codeIndex]) || null : null,
      rawName,
      proposedName: proposed.slice(0, 120),
      rawBarcode: rawBarcode || null,
      barcode,
      sourceCategory:
        (categoryIndex >= 0 ? text(cells[categoryIndex]) : "") || "Sem seção",
      issues,
    });
  }
  if (rows.length === 0)
    throw new Error("Nenhum produto preenchido foi encontrado.");

  const names = new Map<string, ParsedProductImportRow[]>();
  const barcodes = new Map<string, ParsedProductImportRow[]>();
  for (const row of rows) {
    const nameKey = normalizeEntityName(row.proposedName);
    names.set(nameKey, [...(names.get(nameKey) ?? []), row]);
    if (row.barcode)
      barcodes.set(row.barcode, [...(barcodes.get(row.barcode) ?? []), row]);
  }
  for (const duplicates of names.values()) {
    if (duplicates.length > 1)
      duplicates.forEach((row) => row.issues.push("duplicate_name_file"));
  }
  for (const duplicates of barcodes.values()) {
    if (duplicates.length > 1)
      duplicates.forEach((row) => row.issues.push("duplicate_barcode_file"));
  }

  return { sheetName, rows };
}
