/**
 * Tipos de unidade aceitos pelo banco.
 *
 * A lista espelha o CHECK `units_kind_check`. Se divergir, o insert falha no
 * banco — por isso ela fica em um módulo só, compartilhado entre o formulário
 * (cliente) e a validação (servidor), em vez de repetida nos dois lugares.
 */
export const UNIT_KINDS = [
  { value: "mass", label: "Massa", hint: "kg, g" },
  { value: "count", label: "Contagem", hint: "un, pç" },
  { value: "package", label: "Embalagem", hint: "cx, fardo, pacote" },
  { value: "volume", label: "Volume", hint: "L, mL" },
  { value: "length", label: "Comprimento", hint: "m, cm" },
  { value: "area", label: "Área", hint: "m²" },
  { value: "other", label: "Outro", hint: "" },
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number]["value"];

export const UNIT_KIND_VALUES = UNIT_KINDS.map((k) => k.value) as [
  UnitKind,
  ...UnitKind[],
];

export const UNIT_KIND_LABEL: Record<string, string> = Object.fromEntries(
  UNIT_KINDS.map((k) => [k.value, k.label]),
);

/**
 * Unidade escrita por extenso, para texto corrido.
 *
 * O fornecedor no link público lê "cada fardo tem 500 unidades", não "cada fd
 * tem 500 un". O nome só chega no payload público a partir da migration 0110;
 * sem ele a sigla continua servindo, e sigla não flexiona — "300 m" está certo
 * no singular e no plural.
 */
export function unitWord(
  unit: { name?: string | null; symbol: string } | null | undefined,
  count = 1,
): string {
  if (!unit) return "";
  const name = unit.name?.trim();
  if (!name) return unit.symbol;

  const singular = name.toLocaleLowerCase("pt-BR");
  return count === 1 ? singular : pluralizar(singular);
}

/** Plural suficiente para nome de unidade — fardo, caixa, metro, quilo, litro. */
function pluralizar(palavra: string): string {
  if (palavra.endsWith("s")) return palavra;
  if (palavra.endsWith("ão")) return `${palavra.slice(0, -2)}ões`;
  if (palavra.endsWith("m")) return `${palavra.slice(0, -1)}ns`;
  if (palavra.endsWith("l")) return `${palavra.slice(0, -1)}is`;
  if (/[rz]$/.test(palavra)) return `${palavra}es`;
  return `${palavra}s`;
}
